import {
  pgTable,
  serial,
  bigserial,
  bigint,
  varchar,
  text,
  integer,
  smallint,
  timestamp,
  real,
  jsonb,
  vector,
  primaryKey,
  index,
  check,
  customType,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { courseStatusEnum, skillRelationRoleEnum } from './enums.js';

export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 140 }).notNull().unique(),
  description: text('description'),
  parentId: integer('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skills = pgTable('skills', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  code: varchar('code', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable(
  'courses',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 280 }).notNull().unique(),
    shortDescription: varchar('short_description', { length: 500 }).notNull(),
    descriptionMd: text('description_md').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    difficultyLevel: smallint('difficulty_level').notNull().default(1),
    syllabusTemplate: jsonb('syllabus_template').notNull().default([]),
    status: courseStatusEnum('status').notNull().default('DRAFT'),
    embedding: vector('embedding', { dimensions: 1024 }),
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(short_description, ''))`
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check('chk_courses_difficulty', sql`${table.difficultyLevel} BETWEEN 1 AND 5`),
    index('idx_courses_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('idx_courses_search_tsv_gin').using('gin', table.searchTsv),
  ]
);

export const courseSkills = pgTable(
  'course_skills',
  {
    courseId: bigint('course_id', { mode: 'number' })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    skillRole: skillRelationRoleEnum('skill_role').notNull(),
    targetWeight: real('target_weight').notNull().default(1.0),
  },
  (table) => [
    primaryKey({ columns: [table.courseId, table.skillId, table.skillRole] }),
    check('chk_course_skills_weight', sql`${table.targetWeight} > 0`),
  ]
);
