import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Role } from '../../../generated/prisma/enums';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createContext = (userRole?: Role): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: userRole ? { role: userRole } : undefined,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(createContext(Role.USER))).toBe(true);
  });

  it('allows access for ADMIN role', () => {
    const context = createContext(Role.ADMIN);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access for USER role when ADMIN is required', () => {
    const context = createContext(Role.USER);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies access when user is not present', () => {
    const context = createContext();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(context)).toBe(false);
  });
});
