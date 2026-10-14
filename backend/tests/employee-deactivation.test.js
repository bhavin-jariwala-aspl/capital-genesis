'use strict';

/**
 * Deactivate / reactivate guards. Before this, any workspace admin could switch
 * off the platform administrator (who signs in through a workspace), an account
 * with more authority than their own, or themselves.
 */

const { findManageableEmployee } = require('../src/routes/auth');

function db(employee, roleLevel) {
  return {
    employee: { findFirst: jest.fn(async () => employee) },
    role: { findFirst: jest.fn(async () => (roleLevel == null ? null : { level: roleLevel })) },
  };
}
const admin = { employeeId: 'GCADMIN', role: 'admin', role_level: 3 };
const req = (id, user = admin) => ({ params: { id }, user });

describe('findManageableEmployee', () => {
  it('returns an employee the admin outranks', async () => {
    await expect(findManageableEmployee(db({ employee_id: 'GCRM1', role: 'rm' }, 5), req('GCRM1')))
      .resolves.toEqual({ employee_id: 'GCRM1', role: 'rm' });
  });

  it('404s an employee outside the workspace', async () => {
    await expect(findManageableEmployee(db(null), req('OTHER1'))).rejects.toThrow(/Employee/);
  });

  it('refuses the platform administrator', async () => {
    await expect(findManageableEmployee(db({ employee_id: 'PLATFORM01', role: 'platform_admin' }, 1), req('PLATFORM01')))
      .rejects.toThrow(/platform console/);
  });

  it('refuses an account with more authority', async () => {
    await expect(findManageableEmployee(db({ employee_id: 'GCOWNER', role: 'super_admin' }, 2), req('GCOWNER')))
      .rejects.toThrow(/more authority/);
  });

  it('refuses self-deactivation but allows self for reactivation checks', async () => {
    const self = db({ employee_id: 'GCADMIN', role: 'admin' }, 3);
    await expect(findManageableEmployee(self, req('GCADMIN'))).rejects.toThrow(/your own account/);
    await expect(findManageableEmployee(self, req('GCADMIN'), { self: true })).resolves.toBeTruthy();
  });
});
