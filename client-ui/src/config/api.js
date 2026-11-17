import { configureRequestDrivenService } from './serviceRequest.js';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
export const VISION_ENGINE_URL = import.meta.env.VITE_VISION_ENGINE_URL || 'http://localhost:8000';

export const API_REQUEST_DRIVEN = import.meta.env.VITE_API_REQUEST_DRIVEN === 'true';

if (API_REQUEST_DRIVEN) configureRequestDrivenService(API_BASE_URL);
