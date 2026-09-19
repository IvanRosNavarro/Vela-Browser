import { describe, expect, it } from 'vitest';
import { parseCsvRecords, parsePasswordCsv } from './passwordCsv';

describe('parseCsvRecords', () => {
  it('maneja comillas, comillas escapadas y saltos de línea dentro de campos', () => {
    const csv = '﻿a,b,c\r\n"1,5","dice ""hola""","línea 1\nlínea 2"\r\n\r\nx,y,z';
    expect(parseCsvRecords(csv)).toEqual([
      ['a', 'b', 'c'],
      ['1,5', 'dice "hola"', 'línea 1\nlínea 2'],
      ['x', 'y', 'z'],
    ]);
  });
});

describe('parsePasswordCsv', () => {
  it('lee el CSV de Chrome/Edge (name,url,username,password,note)', () => {
    const csv = [
      'name,url,username,password,note',
      'github.com,https://github.com/login,ana,s3cr,et,"nota con, coma"',
      'app,android://abc@com.example/,ana,pw,',
    ].join('\n');
    const rows = parsePasswordCsv(csv.replace('s3cr,et', '"s3cr,et"'));
    expect(rows[0]).toEqual({
      domain: 'github.com',
      url: 'https://github.com/login',
      username: 'ana',
      password: 's3cr,et',
      notes: 'nota con, coma',
    });
    // Las entradas de apps Android no tienen dominio web: el importador las omite.
    expect(rows[1]!.domain).toBe('');
  });

  it('lee el CSV de Firefox', () => {
    const csv = [
      '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"',
      '"https://www.mozilla.org","luis","pw1","","https://www.mozilla.org","{1}","1","2","3"',
    ].join('\r\n');
    expect(parsePasswordCsv(csv)).toEqual([
      { domain: 'www.mozilla.org', url: 'https://www.mozilla.org', username: 'luis', password: 'pw1', notes: '' },
    ]);
  });

  it('lee el CSV de Bitwarden y el de Safari', () => {
    const bitwarden = [
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
      ',,login,Ejemplo,apunte,,0,https://ejemplo.es,eva,pw2,',
    ].join('\n');
    expect(parsePasswordCsv(bitwarden)[0]).toMatchObject({ domain: 'ejemplo.es', username: 'eva', password: 'pw2', notes: 'apunte' });

    const safari = 'Title,URL,Username,Password,Notes,OTPAuth\nEj,https://ej.com/,u,p,n,';
    expect(parsePasswordCsv(safari)[0]).toMatchObject({ domain: 'ej.com', username: 'u', password: 'p', notes: 'n' });
  });
});
