/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_ML_SERVICE_URL?: string;
	readonly VITE_API_GATEWAY_URL?: string;
	readonly VITE_APP_AUTH_TOKEN?: string;
	readonly VITE_ACTIVE_TRIP_ID?: string;
	readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface Window {
	google?: {
		accounts?: {
			id?: {
				initialize: (config: {
					client_id: string;
					callback: (response: { credential?: string }) => void;
				}) => void;
				renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
			};
		};
	};
}
