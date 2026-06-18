sed -i '' "s/import Redis from 'ioredis';/import { Redis } from 'ioredis';/" src/*.ts
sed -i '' "s/v =>/v: string =>/" src/*.ts
sed -i '' "s/v: string => JSON.parse(v)/(v: string) => JSON.parse(v)/" src/*.ts
