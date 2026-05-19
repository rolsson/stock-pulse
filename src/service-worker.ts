/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `stock-pulse-${version}`;

const PRECACHE = [
	...build,
	...files,
	'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,600&display=swap'
];

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	if (e.request.url.includes('/api/')) {
		e.respondWith(fetch(e.request));
		return;
	}

	e.respondWith(
		caches.match(e.request).then((cached) => {
			if (cached) return cached;
			return fetch(e.request).then((response) => {
				if (!response || response.status !== 200 || e.request.method !== 'GET') return response;
				const clone = response.clone();
				caches.open(CACHE).then((cache) => cache.put(e.request, clone));
				return response;
			}).catch(() => {
				if (e.request.mode === 'navigate') return caches.match('/') as Promise<Response>;
			});
		})
	);
});
