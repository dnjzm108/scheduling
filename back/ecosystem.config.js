module.exports = {
  apps: [
    {
      name: "backend",
      script: "app.js",

      // 개발 환경
      env: {
        NODE_ENV: "development",
        DB_HOST: "localhost",
        DB_USER: "root",
        DB_PASS: "0000",
        API_URL: "http://localhost:3000",
      },

      // 배포 환경
      env_production: {
        NODE_ENV: "production",
        DB_HOST: "localhost",
        DB_USER: "root",
        DB_PASS: "0000",
        API_URL: "http://34.50.15.70",
      }
    }
  ]
};
