export {
  Role,
  UserStatus,
  FileStatus,
  UploadStatus,
} from '../generated/prisma';
export type { User, UserInvitation, File, Upload } from '../generated/prisma';

export class PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options?: unknown) {
    // no-op mock constructor
  }

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }
}
