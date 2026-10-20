import { useEffect, useState } from 'preact/hooks';

export const routes = ['dashboard', 'workout', 'history', 'settings'] as const;
export type Route = (typeof routes)[number];

const DEFAULT_ROUTE: Route = 'dashboard';

function parseHash(): Route {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  return (routes as readonly string[]).includes(name) ? (name as Route) : DEFAULT_ROUTE;
}

export function href(route: Route, param?: string): string {
  return param ? `#/${route}/${encodeURIComponent(param)}` : `#/${route}`;
}

function parseParam(): string | null {
  const part = location.hash.replace(/^#\/?/, '').split('/')[1];
  return part ? decodeURIComponent(part) : null;
}

export function useRouteParam(): string | null {
  const [param, setParam] = useState<string | null>(parseParam);
  useEffect(() => {
    const onChange = () => setParam(parseParam());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return param;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
