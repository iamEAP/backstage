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

import { LocationSpec } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import * as results from './results';
import { LocationProcessor, LocationProcessorEmit } from './types';
import {
  getGroups,
  getUsers,
  initClient,
  ProviderConfig,
  readConfig,
} from './util/ldap';
import { buildOrgHierarchy } from './util/org';

/**
 * Extracts teams and users out of an LDAP server.
 */
export class LdapOrgReaderProcessor implements LocationProcessor {
  static fromConfig(config: Config) {
    return new LdapOrgReaderProcessor(
      readConfig(config.getConfig('catalog.processors.ldapOrg')),
    );
  }

  constructor(private readonly providers: ProviderConfig[]) {}

  async readLocation(
    location: LocationSpec,
    _optional: boolean,
    _emit: LocationProcessorEmit,
  ): Promise<boolean> {
    if (location.type !== 'ldap-org') {
      return false;
    }

    const provider = this.providers.find(p => location.target === p.target);
    if (!provider) {
      throw new Error(
        `There is no LDAP Org provider that matches ${location.target}. Please add a configuration entry for it under catalog.processors.ldapOrg.providers.`,
      );
    }

    const client = await initClient(provider);
    const { users } = await getUsers(client, provider);
    const { groups, groupMemberUsers } = await getGroups(client, provider);
    buildOrgHierarchy(groups, users, groupMemberUsers);
    console.log(users[0]);
    console.log(groups[0]);

    // for (const group of groups) {
    //   emit(results.entity(location, group));
    // }
    // for (const user of users) {
    //   emit(results.entity(location, user));
    // }

    return true;
  }
}
