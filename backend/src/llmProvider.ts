export type LLMProvider = 'openai' | 'ollama';

const SUPPORTED_PROVIDERS: LLMProvider[] = ['openai', 'ollama'];

let cachedProvider: LLMProvider | undefined;

export function getLLMProvider(): LLMProvider {
	if (!cachedProvider) {
		const envProvider = (
			process.env.LLM_PROVIDER ?? 'openai'
		).toLowerCase() as LLMProvider;
		if (!SUPPORTED_PROVIDERS.includes(envProvider)) {
			throw new Error(
				`Unsupported LLM_PROVIDER: '${envProvider}'. Must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`
			);
		}
		cachedProvider = envProvider;
	}
	return cachedProvider;
}

export function isOllamaProvider(): boolean {
	return getLLMProvider() === 'ollama';
}

export function getEmbeddingModelName(): string {
	return (
		process.env.EMBEDDING_MODEL ??
		(isOllamaProvider() ? 'nomic-embed-text' : 'text-embedding-ada-002')
	);
}

export function getDefaultModelId(): string {
	return (
		process.env.DEFAULT_MODEL ??
		(isOllamaProvider() ? 'llama3.1' : 'gpt-3.5-turbo')
	);
}
