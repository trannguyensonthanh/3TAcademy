import { pgTable, serial, bigserial, varchar, text, integer, smallint, timestamp, real, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { courseStatusEnum, skillRelationRoleEnum } from './enums.js';

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  description: text('description'),
  parentId: integer('parent_id'),
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

export const courses = pgTable('courses', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 280 }).notNull().unique(),
  shortDescription: varchar('short_description', { length: 500 }).notNull(),
  descriptionMd: text('description_md').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  previewYoutubeUrl: text('preview_youtube_url'),
  difficultyLevel: smallint('difficulty_level').notNull().default(1),
  syllabusTemplate: jsonb('syllabus_template').notNull().default([]),
  status: courseStatusEnum('status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courseSkills = pgTable('course_skills', {
  courseId: bigserial('course_id', { mode: 'number' }).notNull().references(() => courses.id, { onDelete: 'cascade' }),
  skillId: integer('skill_id').notNull().references(() => skills.id, { onDelete: 'restrict' }),
  skillRole: skillRelationRoleEnum('skill_role').notNull(),
  targetWeight: real('target_weight').notNull().default(1.0),
}, (table) => [
  primaryKey({ columns: [table.courseId, table.skillId, table.skillRole] }),
]);
