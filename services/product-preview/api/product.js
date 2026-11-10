import settings from '../../../deployment.json' with { type: 'json' };
import { previewResponse } from '../preview.mjs';

export const GET = request => previewResponse(request, settings);
export const HEAD = GET;
