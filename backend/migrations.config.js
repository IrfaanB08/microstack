module.exports = {
  dir: './migrations',
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: 'migrations',
  schema: 'public',
  singleTransaction: false,
  noLock: false,
};
