import { pgTable, text, boolean, json, real } from 'drizzle-orm/pg-core';

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  currency: text('currency').notNull(),
  viewSettings: json('view_settings')
});

export const insumos = pgTable('insumos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  price: real('price').notNull(),
  active: boolean('active').default(true).notNull(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: real('price').notNull(),
  recipe: json('recipe').default([]),
  directSale: boolean('direct_sale').default(false).notNull(),
  category: text('category'),
  subgroup: text('subgroup'),
});

export const days = pgTable('days', {
  date: text('date').primaryKey(), // YYYY-MM-DD
  opening: json('opening').default({}),
  input: json('input').default({}),
  payments: json('payments').default({}),
  expenses: json('expenses').default([]),
  sales: json('sales').default([]),
  movements: json('movements').default([]),
  physical: json('physical').default({}),
  report: json('report').default({}),
});
