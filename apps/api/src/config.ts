function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '127.0.0.1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  get isProd() {
    return this.nodeEnv === 'production';
  },
  databaseUrl: required('DATABASE_URL'),
  appOrigins: (process.env.APP_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
  sessionDays: 30,
  sessionCookie: 'nf_session',
};
