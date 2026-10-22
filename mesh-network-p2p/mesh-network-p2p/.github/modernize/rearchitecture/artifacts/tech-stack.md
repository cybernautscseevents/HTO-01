# Technology Stack

- Runtime: Node.js CommonJS servers plus browser JavaScript modules.
- Frontend: React `19.2.8`, React DOM `19.2.8`, React Router DOM `7.18.3`.
- Tooling: Vite `8.2.2`, `@vitejs/plugin-react` `6.1.1`, `@vitejs/plugin-basic-ssl` `2.3.0`.
- Backend: Express `5.2.1`, Socket.IO and client `4.8.3`, CORS `2.8.6`.
- Styling: vanilla CSS in `src/index.css`; Google Fonts loaded by `index.html`.
- Browser APIs: WebRTC, Web Crypto, Web Audio, MediaRecorder, DeviceMotion, Geolocation, Battery Status, Notifications, Canvas.
- Build: `npm run build` runs `vite build`; output is `dist`.
- Local development: Vite HTTPS on port 3000 proxies Socket.IO, `/api`, `/sync`, `/model`, `/state`, and `/echolocate-api` to port 4001.
- Runtime ports: signaling/combined server 4001, cloud server 4002, EchoLocate server 4003, standalone Lifeboat API 4004 unless `PORT` is set.
- Deployment descriptors: `render.yaml` deploys `signaling-server.js`; `vercel.json` deploys the Vite `dist` output.
- Configuration: `VITE_BACKEND_URL` and optional `VITE_CLOUD_URL` are read from Vite environment variables.

No database, ORM, authentication provider, message broker, or persistent storage is present. Service state is process-local memory.
