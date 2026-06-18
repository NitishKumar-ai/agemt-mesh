module.exports = {
  apps: [
    {
      name: 'agentmesh-server-lite',
      script: 'server-lite/dist/index.js',
      instances: 1, // Can be set to 'max' for clustering
      exec_mode: 'fork', // Fork mode is recommended when using SQLite
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
        DB_PATH: './data/agent_mesh.sqlite',
        // Injected keys should be configured here or loaded from system env
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        E2B_API_KEY: process.env.E2B_API_KEY,
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
        LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
    },
  ],
};
