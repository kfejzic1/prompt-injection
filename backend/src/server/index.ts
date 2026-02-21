import { env, exit } from 'node:process';

import { initDocumentVectors } from '@src/document';
import { getLLMProvider, isOllamaProvider } from '@src/llmProvider';
import { getValidModels } from '@src/openai';

import app from './app';

const MAX_RETRIES = 60;
const RETRY_INTERVAL_MS = 15_000;

async function retryOnOllama<T>(
	label: string,
	fn: () => Promise<T>
): Promise<T> {
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await fn();
		} catch (err: unknown) {
			if (!isOllamaProvider() || attempt === MAX_RETRIES) {
				throw err;
			}
			const msg =
				err instanceof Error ? err.message : String(err);
			console.warn(
				`[${label}] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${RETRY_INTERVAL_MS / 1000}s...`
			);
			await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
		}
	}
	throw new Error(`[${label}] All ${MAX_RETRIES} attempts exhausted`);
}

// by default runs on port 3000
const port = env.PORT ?? String(3000);

app.listen(port, () => {
	const provider = getLLMProvider();
	console.debug(`LLM provider: ${provider}`);

	retryOnOllama('models', getValidModels)
		.then(() => retryOnOllama('vectors', initDocumentVectors))
		.then(() => {
			console.debug('Document vector store initialized');
			console.log(`Server is running on port ${port} (provider: ${provider})`);
		})
		.catch((err: unknown) => {
			console.error(err);
			exit(1);
		});
});
