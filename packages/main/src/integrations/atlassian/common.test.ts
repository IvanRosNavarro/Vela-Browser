import { describe, expect, it } from 'vitest';
import { jiraGatewayBase, normalizeJiraSite, basicAuthHeaders } from './common';
import { ProviderAuthError } from '../types';

describe('normalizeJiraSite', () => {
  it.each([
    ['acme', 'acme.atlassian.net'],
    ['acme.atlassian.net', 'acme.atlassian.net'],
    ['  ACME.atlassian.net  ', 'acme.atlassian.net'],
    ['https://acme.atlassian.net', 'acme.atlassian.net'],
    ['https://acme.atlassian.net/jira/your-work', 'acme.atlassian.net'],
    ['acme.atlassian.net/browse/WEB-1', 'acme.atlassian.net'],
    ['legacy.jira.com', 'legacy.jira.com'],
    ['mi-empresa-2', 'mi-empresa-2.atlassian.net'],
  ])('acepta %s', (input, expected) => {
    expect(normalizeJiraSite(input)).toBe(expected);
  });

  // El host acaba recibiendo el token del usuario desde main: cualquier cosa que
  // no sea un sitio de Atlassian tiene que quedarse fuera.
  it.each([
    [''],
    ['https://evil.example.com'],
    ['evil.com'],
    ['acme.atlassian.net.evil.com'],
    ['http://acme.atlassian.net'],
    ['https://acme.atlassian.net:8443'],
    ['https://user:pass@acme.atlassian.net'],
    ['acme.atlassian.net@evil.com'],
    ['a.b.atlassian.net'],
    ['127.0.0.1'],
    ['https://127.0.0.1'],
    ['acme atlassian'],
    ['-acme.atlassian.net'],
  ])('rechaza %j', (input) => {
    expect(() => normalizeJiraSite(input)).toThrow(ProviderAuthError);
  });
});

describe('jiraGatewayBase', () => {
  it('construye la pasarela con un cloudId válido', () => {
    expect(jiraGatewayBase('11111111-2222-3333-4444-555555555555')).toBe(
      'https://api.atlassian.com/ex/jira/11111111-2222-3333-4444-555555555555',
    );
  });

  it('no mete en la URL un cloudId que no tenga forma de uuid', () => {
    expect(() => jiraGatewayBase('../../evil')).toThrow(ProviderAuthError);
  });
});

describe('basicAuthHeaders', () => {
  it('codifica email:token en Basic', () => {
    const { Authorization } = basicAuthHeaders({
      token: 'tok',
      email: 'yo@acme.com',
      authMethod: 'token',
    });
    expect(Authorization).toBe(`Basic ${Buffer.from('yo@acme.com:tok').toString('base64')}`);
  });

  it('sin email no hay cabecera posible', () => {
    expect(() => basicAuthHeaders({ token: 'tok', authMethod: 'token' })).toThrow(ProviderAuthError);
  });
});
