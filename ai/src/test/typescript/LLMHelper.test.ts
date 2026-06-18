import { describe, it, expect, beforeEach } from 'vitest';
import { LLMHelper } from '../../main/typescript/LLMHelper.js';

describe('LLMHelper', () => {
  let llm: any;

  beforeEach(() => {
    // We use any to access private methods for testing
    llm = new LLMHelper(null as any, null as any) as any;
  });

  it('testParseNestedJsonStringsWithSimpleNestedJson', () => {
    const input = {
      query: '',
      filter: '{"value":"page"}',
      simple: 'value',
    };

    const result = llm.parseNestedJsonStrings(input);

    expect(result).toBeDefined();
    expect(result.query).toBe('');
    expect(result.simple).toBe('value');
    expect(result.filter).toBeInstanceOf(Object);
    expect(result.filter.value).toBe('page');
  });

  it('testParseNestedJsonStringsWithDeeplyNestedJson', () => {
    const input = {
      user: '{"profile":{"preferences":{"theme":"dark","notifications":{"email":true}}}}',
      simple: 'value',
    };

    const result = llm.parseNestedJsonStrings(input);

    expect(result).toBeDefined();
    expect(result.simple).toBe('value');
    expect(result.user.profile.preferences.theme).toBe('dark');
    expect(result.user.profile.preferences.notifications.email).toBe(true);
  });

  it('testParseNestedJsonStringsWithArrayJson', () => {
    const input = {
      items: '[{"id":1,"name":"test"},{"id":2,"name":"test2"}]',
      simple: 'value',
    };

    const result = llm.parseNestedJsonStrings(input);

    expect(result).toBeDefined();
    expect(result.simple).toBe('value');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBe(2);
    expect(result.items[0].id).toBe(1);
    expect(result.items[0].name).toBe('test');
  });

  it('testParseNestedJsonStringsWithMixedDataTypes', () => {
    const input = {
      string: 'simple string',
      number: 42,
      boolean: true,
      jsonString: '{"nested":"value"}',
      arrayString: '[1,2,3]',
      nestedMap: { key: 'value' },
    };

    const result = llm.parseNestedJsonStrings(input);

    expect(result).toBeDefined();
    expect(result.string).toBe('simple string');
    expect(result.number).toBe(42);
    expect(result.boolean).toBe(true);
    expect(result.jsonString.nested).toBe('value');
    expect(Array.isArray(result.arrayString)).toBe(true);
    expect(result.arrayString).toEqual([1, 2, 3]);
    expect(result.nestedMap.key).toBe('value');
  });

  it('testParseNestedJsonStringsWithInvalidJson', () => {
    const input = {
      validJson: '{"key":"value"}',
      invalidJson: 'not a json string',
      emptyString: '',
    };

    const result = llm.parseNestedJsonStrings(input);

    expect(result).toBeDefined();
    expect(result.validJson.key).toBe('value');
    expect(result.invalidJson).toBe('not a json string');
    expect(result.emptyString).toBe('');
  });

  it('testExtractMethodFromInputParametersWithDynamicKey', () => {
    const inputParameters = {
      toolu_01YDpSHJ9NQKE452s7Mhvy5L: {
        method: 'jira-getIssue',
        integrationName: 'Jira',
        issueIdOrKey: 'CDX-436',
      },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBe('jira-getIssue');
  });

  it('testExtractMethodFromInputParametersWithNullInput', () => {
    const method = llm.extractMethodFromInputParameters(undefined);
    expect(method).toBeUndefined();
  });

  it('testExtractMethodFromInputParametersWithEmptyMap', () => {
    const method = llm.extractMethodFromInputParameters({});
    expect(method).toBeUndefined();
  });

  it('testExtractMethodFromInputParametersWithoutMethodKey', () => {
    const inputParameters = {
      toolu_01YDpSHJ9NQKE452s7Mhvy5L: {
        integrationName: 'Jira',
        issueIdOrKey: 'CDX-436',
      },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBeUndefined();
  });

  it('testExtractMethodFromInputParametersWithNonMapValues', () => {
    const inputParameters = {
      key1: 'string value',
      key2: 123,
      key3: ['item1', 'item2'],
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBeUndefined();
  });

  it('testExtractMethodFromInputParametersWithMultipleEntries', () => {
    const inputParameters = {
      firstKey: { otherKey: 'otherValue' },
      secondKey: { method: 'slack-sendMessage', channel: '#general' },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBe('slack-sendMessage');
  });

  it('testExtractMethodFromInputParametersWithMethodAsString', () => {
    const inputParameters = {
      dynamicKey: { method: 'github-createIssue' },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBe('github-createIssue');
  });

  it('testExtractMethodFromInputParametersWithMethodAsInteger', () => {
    const inputParameters = {
      dynamicKey: { method: 12345 },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBe('12345');
  });

  it('testExtractMethodFromInputParametersWithMethodAsNull', () => {
    const inputParameters = {
      dynamicKey: { method: null },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBeUndefined();
  });

  it('testExtractMethodFromInputParametersWithMixedStructure', () => {
    const inputParameters = {
      stringKey: 'string value',
      numberKey: 42,
      toolKey: { method: 'custom-action', param1: 'value1' },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBe('custom-action');
  });

  it('testExtractMethodFromInputParametersWithDeepNesting', () => {
    const inputParameters = {
      outerKey: { deep: { method: 'deep-method' } },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBeUndefined();
  });

  it('testExtractMethodFromInputParametersWithMultipleMapsFirstHasMethod', () => {
    const inputParameters = {
      firstKey: { method: 'first-method' },
      secondKey: { method: 'second-method' },
    };

    const method = llm.extractMethodFromInputParameters(inputParameters);
    expect(method).toBeDefined();
    expect(['first-method', 'second-method']).toContain(method);
  });

  it('testEnsureLastMessageIsFromUser_replacesWhenLastIsAssistant', () => {
    const messages: any[] = [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'I will help you with' },
    ];

    llm.ensureLastMessageIsFromUser(messages);

    expect(messages.length).toBe(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].text).toContain('I will help you with');
    expect(messages[1].text).toContain('continue where you left off');
  });

  it('testEnsureLastMessageIsFromUser_appendsWhenLastIsSystem', () => {
    const messages: any[] = [
      { role: 'system', text: 'You are a helpful assistant' },
    ];

    llm.ensureLastMessageIsFromUser(messages);

    expect(messages.length).toBe(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].text).toBe('Please continue where you left off.');
  });

  it('testEnsureLastMessageIsFromUser_noChangeWhenLastIsUser', () => {
    const messages: any[] = [
      { role: 'system', text: 'You are a helpful assistant' },
      { role: 'user', text: 'Hello' },
    ];

    llm.ensureLastMessageIsFromUser(messages);

    expect(messages.length).toBe(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].text).toBe('Hello');
  });

  it('testEnsureLastMessageIsFromUser_noChangeWhenEmpty', () => {
    const messages: any[] = [];

    llm.ensureLastMessageIsFromUser(messages);

    expect(messages.length).toBe(0);
  });

  it('testEnsureLastMessageIsFromUser_multipleAssistantMessages', () => {
    const messages: any[] = [
      { role: 'user', text: 'Summarize this document' },
      { role: 'assistant', text: 'The document discusses' },
      { role: 'assistant', text: 'continuing from where I left off' },
    ];

    llm.ensureLastMessageIsFromUser(messages);

    expect(messages.length).toBe(3);
    expect(messages[2].role).toBe('user');
    expect(messages[2].text).toContain('continuing from where I left off');
  });
});
