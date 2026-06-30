import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { doubleCsrf, type DoubleCsrfConfigOptions } from 'csrf-csrf';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import compression from 'compression';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use(helmet());
  app.use(cookieParser());
  const doubleCsrfOptions: DoubleCsrfConfigOptions = {
    getSecret: () => process.env.CSRF_SECRET!,
    getSessionIdentifier: (req) => req.ip ?? '',
  };

  const {
    //invalidCsrfTokenError, // This is provided purely for convenience if you plan on creating your own middleware.
    //generateCsrfToken, // Use this in your routes to generate and provide a CSRF hash, along with a token cookie and token.
    //validateRequest, // Also a convenience if you plan on making your own middleware.
    doubleCsrfProtection, // This is the default CSRF protection middleware.
  } = doubleCsrf(doubleCsrfOptions);

  app.use(doubleCsrfProtection);

  app.use(
    session({
      secret: 'my-secret',
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(compression());

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
