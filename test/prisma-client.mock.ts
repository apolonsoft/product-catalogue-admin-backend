export { Role, UserStatus } from '../generated/prisma/enums';
export type {
  UserModel as User,
  UserInvitationModel as UserInvitation,
} from '../generated/prisma/models';

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
