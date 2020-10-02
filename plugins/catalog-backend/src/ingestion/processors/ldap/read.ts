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

import { Entity, GroupEntity, UserEntity } from '@backstage/catalog-model';
import { LdapClient } from './client';
import { GroupConfig, UserConfig } from './config';
import {
  LDAP_DN_ANNOTATION,
  LDAP_RDN_ANNOTATION,
  LDAP_UUID_ANNOTATION,
} from './constants';

/**
 * Reads groups out of an LDAP provider.
 *
 * @param client The LDAP client (already bound)
 * @param config The provider configuration
 */
export async function getUsers(
  client: LdapClient,
  config: UserConfig,
): Promise<{
  users: UserEntity[];
}> {
  const { dn, options, set, map } = config;

  const entries = await client.search(dn, options);
  console.log(`users:`, entries.length, entries[0]?.attributes?.length);

  const entities: UserEntity[] = [];
  // const entityMemberOfDn: Record<string, string[]> = [];

  for (const entry of entries) {
    const attributes = new Map(
      entry.attributes.map(attr => {
        const data = attr.json;
        return [data.type, data.vals];
      }),
    );

    const entity: UserEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        name: '',
        annotations: {},
      },
      spec: {
        profile: {},
        memberOf: [],
      },
    };

    if (set) {
      for (const { path, value } of set) {
        setJsonPath(entity, path, value);
      }
    }

    mapStringAttr(attributes, map.name, v => {
      entity.metadata.name = v;
    });
    mapStringAttr(attributes, map.description, v => {
      entity.metadata.description = v;
    });
    mapStringAttr(attributes, map.rdn, v => {
      entity.metadata.annotations![LDAP_RDN_ANNOTATION] = v;
    });
    mapStringAttr(attributes, 'entryUUID', v => {
      entity.metadata.annotations![LDAP_UUID_ANNOTATION] = v;
    });
    mapStringAttr(attributes, 'entryDN', v => {
      entity.metadata.annotations![LDAP_DN_ANNOTATION] = v;
    });
    mapStringAttr(attributes, map.displayName, v => {
      entity.spec.profile!.displayName = v;
    });
    mapStringAttr(attributes, map.email, v => {
      entity.spec.profile!.email = v;
    });
    mapStringAttr(attributes, map.picture, v => {
      entity.spec.profile!.picture = v;
    });

    setJsonCnsAttr(attributes, map.memberOf, config.groups.map.rdn, v => {
      entity.spec.memberOf = v;
    });

    entities.push(entity);
  }

  return { users: entities };
}

/**
 * Reads groups out of an LDAP provider.
 *
 * @param client The LDAP client (already bound)
 * @param config The provider configuration
 */
export async function getGroups(
  client: LdapClient,
  config: GroupConfig,
): Promise<{
  groups: GroupEntity[];
  groupMemberUsers: Map<string, string[]>;
}> {
  const { dn, options, set, map } = config;
  const entries = await client.search(dn, options);
  console.log(`groups:`, entries.length, entries[0]?.attributes?.length);

  const groups: GroupEntity[] = [];
  // const groupMemberGroups: Map<string, string[]> = new Map();
  const groupMemberUsers: Map<string, string[]> = new Map();

  for (const entry of entries) {
    const attributes = new Map(
      entry.attributes.map(attr => {
        const data = attr.json;
        return [data.type, data.vals];
      }),
    );

    const entity: GroupEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        name: '',
        annotations: {},
      },
      spec: {
        type: 'unknown',
        ancestors: [],
        children: [],
        descendants: [],
      },
    };

    if (set) {
      for (const { path, value } of set) {
        setJsonPath(entity, path, value);
      }
    }

    mapStringAttr(attributes, map.name, v => {
      entity.metadata.name = v;
    });
    mapStringAttr(attributes, map.description, v => {
      entity.metadata.description = v;
    });
    mapStringAttr(attributes, map.rdn, v => {
      entity.metadata.annotations![LDAP_RDN_ANNOTATION] = v;
    });
    mapStringAttr(attributes, 'entryUUID', v => {
      entity.metadata.annotations![LDAP_UUID_ANNOTATION] = v;
    });
    mapStringAttr(attributes, 'entryDN', v => {
      entity.metadata.annotations![LDAP_DN_ANNOTATION] = v;
    });
    mapStringAttr(attributes, map.type, v => {
      entity.spec.type = v;
    });

    setJsonCnsAttr(attributes, map.members, config.users.map.rdn, v => {
      let members = groupMemberUsers.get(entity.metadata.name);
      if (!members) {
        members = [];
        groupMemberUsers.set(entity.metadata.name, members);
      }
      for (const user of v) {
        if (!members.includes(user)) {
          members.push(user);
        }
      }
    });

    groups.push(entity);
  }

  return {
    groups,
    groupMemberUsers,
  };
}

function mapStringAttr(
  attributes: Map<string, string[]>,
  attributeName: string | undefined,
  setter: (value: string) => void,
) {
  if (attributeName) {
    const values = attributes.get(attributeName);
    if (values && values.length === 1) {
      setter(values[0]);
    }
  }
}

function setJsonCnsAttr(
  attributes: Map<string, string[]>,
  attributeName: string | undefined,
  rdn: string,
  setter: (value: string[]) => void,
) {
  if (attributeName) {
    const values = attributes.get(attributeName);
    if (values) {
      const filtered = values
        .map(value => {
          const first = value.split(',')[0];
          if (first && first.startsWith(`${rdn}=`)) {
            return first.substr(rdn.length + 1);
          }
          return undefined;
        })
        .filter(Boolean);
      setter(filtered as string[]);
    }
  }
}

function setJsonPath(target: Entity, path: string, value: any) {
  if (!path) {
    return;
  }

  const steps = path.split('.');

  let parent = target as any;
  for (const key of steps.slice(0, -1)) {
    let nextTarget = parent[key];
    if (
      !nextTarget ||
      typeof nextTarget !== 'object' ||
      Array.isArray(nextTarget)
    ) {
      nextTarget = {};
      parent[key] = nextTarget;
    }
    parent = nextTarget;
  }

  parent[steps[steps.length - 1]] = value;
}
