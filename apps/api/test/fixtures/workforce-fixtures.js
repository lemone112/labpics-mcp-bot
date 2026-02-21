/**
 * Seed baseline entities for workforce integration tests.
 * Returns IDs as plain strings for direct SQL binding.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{
 *   scopeA: string,
 *   scopeB: string,
 *   projectA: string,
 *   projectB: string,
 *   userA: string,
 *   userB: string,
 *   employeeA: string,
 *   employeeB: string,
 * }>}
 */
export async function seedWorkforceFixtures(pool) {
  const { rows: scopeRows } = await pool.query(
    "SELECT id::text AS id FROM account_scopes WHERE scope_key = 'default' LIMIT 1"
  );
  const scopeA = scopeRows[0]?.id;
  if (!scopeA) throw new Error("default scope is required");

  const { rows: scopeBRows } = await pool.query(
    "INSERT INTO account_scopes(scope_key, name) VALUES ('workforce-it-scope-b', 'Workforce Integration Scope B') RETURNING id::text AS id"
  );
  const scopeB = scopeBRows[0]?.id;

  const { rows: projectARows } = await pool.query(
    "INSERT INTO projects(name, account_scope_id) VALUES ('workforce-it-project-a', $1) RETURNING id::text AS id",
    [scopeA]
  );
  const projectA = projectARows[0]?.id;

  const { rows: projectBRows } = await pool.query(
    "INSERT INTO projects(name, account_scope_id) VALUES ('workforce-it-project-b', $1) RETURNING id::text AS id",
    [scopeB]
  );
  const projectB = projectBRows[0]?.id;

  const { rows: userARows } = await pool.query(
    `
      INSERT INTO app_users(username, password_hash, role, email)
      VALUES ('workforce_user_a', 'hash', 'pm', 'workforce_user_a@example.local')
      RETURNING id::text AS id
    `
  );
  const userA = userARows[0]?.id;

  const { rows: userBRows } = await pool.query(
    `
      INSERT INTO app_users(username, password_hash, role, email)
      VALUES ('workforce_user_b', 'hash', 'pm', 'workforce_user_b@example.local')
      RETURNING id::text AS id
    `
  );
  const userB = userBRows[0]?.id;

  const { rows: employeeARows } = await pool.query(
    `
      INSERT INTO employees(account_scope_id, user_id, display_name, status, timezone)
      VALUES ($1, $2, 'Employee A', 'active', 'UTC')
      RETURNING id::text AS id
    `,
    [scopeA, userA]
  );
  const employeeA = employeeARows[0]?.id;

  const { rows: employeeBRows } = await pool.query(
    `
      INSERT INTO employees(account_scope_id, user_id, display_name, status, timezone)
      VALUES ($1, $2, 'Employee B', 'contractor', 'UTC')
      RETURNING id::text AS id
    `,
    [scopeB, userB]
  );
  const employeeB = employeeBRows[0]?.id;

  return {
    scopeA,
    scopeB,
    projectA,
    projectB,
    userA,
    userB,
    employeeA,
    employeeB,
  };
}
