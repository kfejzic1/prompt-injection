import {
	ChatCompletionAssistantMessageParam,
	ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { getDefaultModelId } from '../llmProvider';

import { ChatInfoMessage, ChatMessage } from './chatMessage';
import { DEFENCE_ID } from './defence';
import { EmailInfo } from './email';

// Known context windows for OpenAI models (tokens)
// https://platform.openai.com/docs/models
const knownContextWindows: Record<string, number> = {
	'gpt-4o': 128000,
	'gpt-4-turbo': 128000,
	'gpt-4': 8192,
	'gpt-3.5-turbo': 16385,
};

const DEFAULT_CONTEXT_WINDOW = 8192;

type CHAT_MODEL_ID = string;

function getContextWindowSize(modelId: CHAT_MODEL_ID): number {
	return (
		knownContextWindows[modelId] ??
		(Number(process.env.CONTEXT_WINDOW_SIZE) || DEFAULT_CONTEXT_WINDOW)
	);
}

// Valid model IDs populated at startup from the provider API
const validModelIds = (() => {
	let ids: CHAT_MODEL_ID[] = [];
	return {
		get: () => ids,
		set: (newIds: CHAT_MODEL_ID[]) => {
			ids = newIds;
		},
	};
})();

const chatModelIds = validModelIds.get;

type ChatModel = {
	id: CHAT_MODEL_ID;
	configuration: ChatModelConfigurations;
};

const modelConfigIds = [
	'temperature',
	'topP',
	'frequencyPenalty',
	'presencePenalty',
] as const;

type MODEL_CONFIG_ID = (typeof modelConfigIds)[number];

type ChatModelConfigurations = {
	[key in MODEL_CONFIG_ID]: number;
};

interface DefenceReport {
	blockedReason: string | null;
	isBlocked: boolean;
	alertedDefences: DEFENCE_ID[];
	triggeredDefences: DEFENCE_ID[];
}

interface SingleDefenceReport {
	defence: DEFENCE_ID;
	blockedReason: string | null;
	status: 'alerted' | 'triggered' | 'ok';
}

interface FunctionCallResponse {
	completion: ChatCompletionMessageParam;
	sentEmails: EmailInfo[];
}

interface ToolCallResponse {
	chatHistory: ChatMessage[];
	sentEmails: EmailInfo[];
}

type ChatModelReply = {
	completion: ChatCompletionAssistantMessageParam | null;
	openAIErrorMessage: string | null;
};

interface TransformedChatMessage {
	preMessage: string;
	message: string;
	postMessage: string;
	transformationName: string;
}

interface MessageTransformation {
	transformedMessage: TransformedChatMessage;
	transformedMessageInfo: string;
	transformedMessageCombined: string;
}

interface ChatHttpResponse {
	reply: string;
	defenceReport: DefenceReport;
	transformedMessage?: TransformedChatMessage;
	wonLevel: boolean;
	isError: boolean;
	openAIErrorMessage: string | null;
	sentEmails: EmailInfo[];
	transformedMessageInfo?: string;
	wonLevelMessage?: ChatInfoMessage;
}

interface LevelHandlerResponse {
	chatResponse: ChatHttpResponse;
	chatHistory: ChatMessage[];
}

function getDefaultChatModel(): ChatModel {
	return {
		id: getDefaultModelId(),
		configuration: {
			temperature: 1,
			topP: 1,
			frequencyPenalty: 0,
			presencePenalty: 0,
		},
	};
}

export type {
	CHAT_MODEL_ID,
	DefenceReport,
	ChatModel,
	ChatModelConfigurations,
	ChatModelReply,
	LevelHandlerResponse,
	ChatHttpResponse,
	TransformedChatMessage,
	FunctionCallResponse,
	ToolCallResponse,
	MessageTransformation,
	SingleDefenceReport,
	MODEL_CONFIG_ID,
};
export {
	getDefaultChatModel,
	modelConfigIds,
	chatModelIds,
	getContextWindowSize,
};
export const setValidModelIds = validModelIds.set;
