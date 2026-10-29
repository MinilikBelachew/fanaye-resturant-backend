const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');

async function testBootstrap() {
  try {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    console.log('NEST APP MODULES RESOLVED SUCCESSFULLY!');
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('BOOTSTRAP FAILED:', err);
    process.exit(1);
  }
}
testBootstrap();
