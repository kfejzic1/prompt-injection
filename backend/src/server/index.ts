import { env, exit } from 'node:process';

import { initDocumentVectors } from '@src/document';
import { getLLMProvider, isOllamaProvider } from '@src/llmProvider';
import { getValidModels } from '@src/openai';

import app from './app';

const MAX_RETRIES = 60;
const RETRY_INTERVAL_MS = 15_000;

async function fetchModelsWithRetry(provider: string): Promise<void> {
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			await getValidModels();
			console.debug(`${provider} models fetched`);
			return;
		} catch (err: unknown) {
			if (!isOllamaProvider() || attempt === MAX_RETRIES) {
				throw err;
			}
			console.warn(
				`Attempt ${attempt}/${MAX_RETRIES}: ${provider} not ready yet, retrying in ${RETRY_INTERVAL_MS / 1000}s...`
			);
			await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
		}
	}
}

// by default runs on port 3000
const port = env.PORT ?? String(3000);

app.listen(port, () => {
	const provider = getLLMProvider();
	console.debug(`LLM provider: ${provider}`);
	console.debug(`Fetching valid models from ${provider}...`);

	fetchModelsWithRetry(provider)
		.then(() => initDocumentVectors())
		.then(() => {
			console.debug('Document vector store initialized');
			console.log(`Server is running on port ${port} (provider: ${provider})`);
		})
		.catch((err: unknown) => {
			console.error(err);
			exit(1);
		});
});
