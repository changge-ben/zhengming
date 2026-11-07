import path from 'node:path';

export const dataDirectory = path.resolve(process.env.ZHENGMING_DATA_DIR || '.local');
export const staticDirectory = path.resolve(process.env.ZHENGMING_STATIC_DIR || 'dist');
