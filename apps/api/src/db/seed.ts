import { db, pool } from './index.js';
import { accounts, userProfiles, categories, skills, courses, systemSettings } from './schema/index.js';
import argon2 from 'argon2';
import { logger } from '../config/logger.js';

async function seed() {
  logger.info('Starting database seeding...');

  try {
    // 1. Seed System Settings
    await db.insert(systemSettings).values([
      { key: 'maintenance_mode', value: 'false', description: 'Bật/tắt chế độ bảo trì toàn hệ thống', isPublic: true },
      { key: 'support_email', value: 'support@edutech.vn', description: 'Email hỗ trợ kỹ thuật', isPublic: true },
      { key: 'default_seat_limit', value: '50', description: 'Số lượng học viên tối đa mặc định cho mỗi đợt học', isPublic: false },
      { key: 'replay_retention_days', value: '90', description: 'Số ngày lưu trữ video bản ghi bài học', isPublic: false },
    ]).onConflictDoNothing();

    // 2. Seed Default Admin Account
    const adminPasswordHash = await argon2.hash('Admin@2026!');
    const [adminAccount] = await db.insert(accounts).values({
      email: 'admin@edutech.vn',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    }).onConflictDoNothing().returning();

    if (adminAccount) {
      await db.insert(userProfiles).values({
        accountId: adminAccount.id,
        fullName: 'Quản Trị Viên Hệ Thống',
        bio: 'Tài khoản quản trị viên tối cao của Học viện',
      }).onConflictDoNothing();
      logger.info('Admin account seeded: admin@edutech.vn / Admin@2026!');
    }

    // 3. Seed Root Categories
    const [catAi] = await db.insert(categories).values([
      { name: 'Trí Tuệ Nhân Tạo & Dữ Liệu', slug: 'ai-data', description: 'Các chương trình đào tạo AI Engineering, Machine Learning và Data Analysis' },
      { name: 'Kỹ Thuật Phần Mềm & Cloud', slug: 'software-cloud', description: 'Backend, Frontend, DevOps và Điện toán đám mây' },
    ]).onConflictDoNothing().returning();

    if (catAi) {
      // 4. Seed Standard Skills
      await db.insert(skills).values([
        { categoryId: catAi.id, code: 'python-core', name: 'Python Nâng Cao', description: 'Lập trình hướng đối tượng, Generators, Concurrency' },
        { categoryId: catAi.id, code: 'rag-hybrid-search', name: 'RAG & Hybrid Search', description: 'Truy xuất lai kết hợp pgvector và Full-text search' },
        { categoryId: catAi.id, code: 'sql-window-functions', name: 'SQL & Data Modeling', description: 'Thiết kế cơ sở dữ liệu quan hệ và tối ưu truy vấn' },
      ]).onConflictDoNothing();
    }

    logger.info('Database seeding completed successfully!');
  } catch (error) {
    logger.error({ error }, 'Error while seeding database');
    throw error;
  } finally {
    await pool.end();
  }
}

seed();

