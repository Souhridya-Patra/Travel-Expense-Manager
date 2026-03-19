/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_ML_SERVICE_URL?: string;
	readonly VITE_API_GATEWAY_URL?: string;
	readonly VITE_APP_AUTH_TOKEN?: string;
	readonly VITE_ACTIVE_TRIP_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
