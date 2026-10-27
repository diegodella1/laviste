/** Declared HTTP /api surface for Fase 1 PR 1D. Tests fail if server.mjs grows a route not listed here. */

export const ROLE_FORBIDDEN = 'No tenés permiso para esta acción.';

export const ROUTE_SCOPE = Object.freeze([
  {method: 'GET', path: '/api/health', scope: 'public'},
  {method: 'GET', path: '/api/session', scope: 'public'},
  {method: 'POST', path: '/api/login', scope: 'public'},
  {method: 'POST', path: '/api/auth/reset/check', scope: 'public'},
  {method: 'POST', path: '/api/auth/reset', scope: 'public'},
  {method: 'GET', path: '/api/auth/google/start', scope: 'public'},
  {method: 'GET', path: '/api/auth/google/callback', scope: 'public'},
  {method: 'POST', path: '/api/logout', scope: 'user'},
  {method: 'GET', path: '/api/me', scope: 'user'},
  {method: 'PUT', path: '/api/me/alias', scope: 'user'},
  {method: 'POST', path: '/api/me/password', scope: 'user'},
  {method: 'POST', path: '/api/me/sessions/revoke-others', scope: 'user'},
  {method: 'GET', path: '/api/state', scope: 'user'},
  {method: 'GET', path: '/api/export', scope: 'user'},
  {method: 'GET', path: '/api/quotes/status', scope: 'user'},
  {method: 'POST', path: '/api/takes', scope: 'user'},
  {method: 'GET', path: '/api/takes/:id/orders', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/orders', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/orders/:oid/confirm', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/orders/:oid/cancel', scope: 'user'},
  {method: 'GET', path: '/api/takes/:id/versions', scope: 'user'},
  {method: 'GET', path: '/api/takes/:id/reviews', scope: 'user'},
  {method: 'GET', path: '/api/takes/:id/ops', scope: 'user'},
  {method: 'GET', path: '/api/takes/:id/auto', scope: 'user'},
  {method: 'PUT', path: '/api/takes/:id/auto', scope: 'user'},
  {method: 'GET', path: '/api/auto/trades', scope: 'user'},
  {method: 'GET', path: '/api/auto/trades/:id/undo/preview', scope: 'user'},
  {method: 'POST', path: '/api/auto/trades/:id/undo', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/activate', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/review', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/scenario', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/settings', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/idea', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/archive', scope: 'user'},
  {method: 'PUT', path: '/api/takes/:id/visibility', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/rebalance', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/aporte', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/retiro', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/correccion', scope: 'user'},
  {method: 'POST', path: '/api/takes/:id/composition', scope: 'user'},
  {method: 'GET', path: '/api/jobs/:id', scope: 'user'},
  {method: 'POST', path: '/api/chats', scope: 'user'},
  {method: 'POST', path: '/api/chats/:id/messages', scope: 'user'},
  {method: 'GET', path: '/api/brokers/iol/snapshot', scope: 'user'},
  {method: 'GET', path: '/api/brokers/iol/quote', scope: 'user'},
  {method: 'GET', path: '/api/integrations', scope: 'superadmin'},
  {method: 'POST', path: '/api/integrations/openai', scope: 'superadmin'},
  {method: 'POST', path: '/api/integrations/openai/remove', scope: 'superadmin'},
  {method: 'POST', path: '/api/integrations/openai/test', scope: 'superadmin'},
  {method: 'POST', path: '/api/integrations/iol', scope: 'superadmin'},
  {method: 'POST', path: '/api/integrations/iol/remove', scope: 'superadmin'},
  {method: 'POST', path: '/api/quotes/refresh', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/login', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/agent-prompt', scope: 'superadmin'},
  {method: 'PUT', path: '/api/admin/agent-prompt', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/agent-prompt/restore', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/agent-prompt/reset', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/agent-prompt/validate', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/agent-prompt/preview', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/agent-prompt/versions/:id', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/model-prices', scope: 'superadmin'},
  {method: 'PUT', path: '/api/admin/model-prices', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/usage', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/limits', scope: 'superadmin'},
  {method: 'PUT', path: '/api/admin/limits/:userId', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/users/:id/reset-access', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/ai', scope: 'superadmin'},
  {method: 'PUT', path: '/api/admin/ai', scope: 'superadmin'},
  {method: 'GET', path: '/api/admin/feeds', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/feeds', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/feeds/probe', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/feeds/:id/probe', scope: 'superadmin'},
  {method: 'POST', path: '/api/admin/feeds/:id/probar', scope: 'superadmin'},
  {method: 'PATCH', path: '/api/admin/feeds/:id', scope: 'superadmin'},
  {method: 'DELETE', path: '/api/admin/feeds/:id', scope: 'superadmin'},
]);

export function routeScopeNeedle(path) {
  if (!path.includes(':')) return path;
  if (path.includes('/orders/:oid/')) return '(confirm|cancel)';
  if (path.endsWith('/messages')) return 'messages$';
  if (path.startsWith('/api/jobs/')) return 'api\\/jobs';
  if (path.includes('agent-prompt/versions')) return 'agent-prompt\\/versions';
  if (path.includes('/feeds/:id/probe')) return 'probe|probar';
  if (path.includes('/feeds/:id')) return 'admin\\/feeds';
  if (path.includes('/limits/:')) return 'admin\\/limits';
  if (path.includes('/users/') && path.includes('reset-access')) return 'reset-access';
  if (path.includes('/auto/trades')) return 'auto/trades';
  if (path.endsWith('/auto')) return '/auto';
  if (path.includes('/takes/:id/')) return path.slice(path.lastIndexOf('/') + 1);
  return path.replace(/\/:[^/]+/g, '/');
}
