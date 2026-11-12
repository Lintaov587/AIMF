import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const sessions=sqliteTable('sessions',{
 id:text('id').primaryKey(), browserHash:text('browser_hash').notNull(), aiHash:text('ai_hash').notNull(),
 owner:text('owner'), aiOwner:text('ai_owner'), state:text('state').notNull(), activeCommand:text('active_command'),
 lastSeen:integer('last_seen').notNull(), expires:integer('expires').notNull(),
});
export const commands=sqliteTable('commands',{
 id:text('id').primaryKey(),session:text('session').notNull(),payload:text('payload').notNull(),
 status:text('status').notNull(),result:text('result'),expires:integer('expires').notNull(),
},t=>[index('commands_session').on(t.session)]);
export const leaderboard=sqliteTable('leaderboard',{
 id:text('id').primaryKey(),mode:text('mode').notNull(),name:text('name').notNull(),
 elapsedMs:integer('elapsed_ms').notNull(),moves:integer('moves').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('leaderboard_mode_time').on(t.mode,t.elapsedMs)]);
