/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Config, JsonValue } from '@backstage/config';
import { SearchOptions } from 'ldapjs';
import merge from 'lodash/merge';
import { RecursivePartial } from './util';

/**
 * The configuration parameters for a single LDAP provider.
 */
export type ProviderConfig = {
  /**
   * The prefix of the target that this matches on, e.g. "ldaps://ds.example.net",
   * with no trailing slash.
   */
  target: string;

  /**
   * The settings to use for the bind command.
   *
   * If none are specified, the bind command is not issued.
   */
  bind?: BindConfig;

  users: UserConfig;

  groups: GroupConfig;
};

export type BindConfig = {
  dn: string;
  secret: string;
};

export type UserConfig = {
  dn: string;
  options: SearchOptions;
  set?: { path: string; value: JsonValue }[];
  map: {
    rdn: string;
    name: string;
    description?: string;
    displayName: string;
    email: string;
    picture?: string;
    memberOf: string;
  };
};

export type GroupConfig = {
  dn: string;
  options: SearchOptions;
  set?: { path: string; value: JsonValue }[];
  map: {
    rdn: string;
    name: string;
    type: string;
    description: string;
    members: string;
  };
};

const defaultConfig = {
  users: {
    dn: 'ou=people',
    options: {
      scope: 'one',
      attributes: ['*', '+'],
    },
    map: {
      rdn: 'uid',
      name: 'uid',
      displayName: 'cn',
      email: 'mail',
      memberOf: 'memberOf',
    },
  },
  groups: {
    dn: 'ou=groups',
    options: {
      scope: 'one',
      attributes: ['*', '+'],
    },
    map: {
      rdn: 'cn',
      name: 'cn',
      type: 'groupType',
      description: 'description',
      members: 'member',
    },
  },
};

/**
 * Parses configuration.
 *
 * @param config The root of the LDAP config hierarchy
 */
export function readConfig(config: Config): ProviderConfig[] {
  function readBindConfig(
    c: Config | undefined,
  ): ProviderConfig['bind'] | undefined {
    if (!c) {
      return undefined;
    }
    return {
      dn: c.getString('dn'),
      secret: c.getString('secret'),
    };
  }

  function readOptionsConfig(c: Config): SearchOptions {
    return {
      scope: c.getOptionalString('scope') as SearchOptions['scope'],
      filter: c.getOptionalString('filter'),
      attributes: c.getOptionalStringArray('attributes'),
      paged: c.getOptionalBoolean('paged'),
    };
  }

  function readSetConfig(
    c: Config[] | undefined,
  ): { path: string; value: JsonValue }[] | undefined {
    if (!c) {
      return undefined;
    }
    return c.map(entry => ({
      path: entry.getString('path'),
      value: entry.get('value'),
    }));
  }

  function readUserMapConfig(
    c: Config | undefined,
  ): Partial<ProviderConfig['users']['map']> {
    if (!c) {
      return {};
    }

    return {
      rdn: c.getOptionalString('rdn'),
      name: c.getOptionalString('name'),
      description: c.getOptionalString('description'),
      displayName: c.getOptionalString('displayName'),
      email: c.getOptionalString('email'),
      picture: c.getOptionalString('picture'),
      memberOf: c.getOptionalString('memberOf'),
    };
  }

  function readGroupMapConfig(
    c: Config | undefined,
  ): Partial<ProviderConfig['groups']['map']> {
    if (!c) {
      return {};
    }

    return {
      rdn: c.getOptionalString('rdn'),
      name: c.getOptionalString('name'),
      type: c.getOptionalString('type'),
      description: c.getOptionalString('description'),
      members: c.getOptionalString('members'),
    };
  }

  function readUserConfig(
    c: Config,
  ): RecursivePartial<ProviderConfig['users']> {
    return {
      dn: c.getOptionalString('dn'),
      options: readOptionsConfig(c.getConfig('options')),
      set: readSetConfig(c.getOptionalConfigArray('set')),
      map: readUserMapConfig(c.getOptionalConfig('map')),
    };
  }

  function readGroupConfig(
    c: Config,
  ): RecursivePartial<ProviderConfig['groups']> {
    return {
      dn: c.getOptionalString('dn'),
      options: readOptionsConfig(c.getConfig('options')),
      set: readSetConfig(c.getOptionalConfigArray('set')),
      map: readGroupMapConfig(c.getOptionalConfig('map')),
    };
  }

  const providerConfigs = config.getOptionalConfigArray('providers') ?? [];
  return providerConfigs.map(
    c =>
      (merge({}, defaultConfig, {
        target: c.getString('target').replace(/\/+$/, ''),
        bind: readBindConfig(c.getOptionalConfig('bind')),
        users: readUserConfig(c.getConfig('users')),
        groups: readGroupConfig(c.getConfig('groups')),
      }) as unknown) as ProviderConfig,
  );
}
