# RBAC v2: матрица ролей и разрешений

## Роли

- `owner`
- `pm`
- `delivery_lead`
- `executor`
- `viewer`

## Базовые правила

1. **Deny-by-default**: если permission не описан в матрице роли — доступ запрещён.
2. API key без `admin` наследует роль `pm`; с `admin` — `owner`.
3. Для не-owner ролей доступ к проекту ограничен `project_assignments`.

## Permission matrix (ядро)

| Permission | owner | pm | delivery_lead | executor | viewer |
|---|---:|---:|---:|---:|---:|
| `project.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `project.create` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `user.read` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `user.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `project_assignment.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `api_keys.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `workforce.employee.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workforce.employee.write` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `workforce.condition.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workforce.condition.write` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `workforce.link.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workforce.link.write` | ✅ | ✅ | ✅ | ❌ | ❌ |

## Аудит

Для операций управления доступом и assignment нужно сохранять:

- `actor_user_id`
- `entity_type`
- `entity_id`
- `action`
- `request_id`

Поля уже поддерживаются в `audit_events` и используются в user/assignment flow.
