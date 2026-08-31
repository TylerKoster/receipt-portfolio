/* global document */

import {
  CONTROLLED_PUBLIC_SKILL_RECORDS,
  initializePublicSkillLedgerInventory,
} from './public-inventory-adapter.js';
import { SOURCE_BOUND_PUBLIC_SKILL_RECORDS } from './public-inventory-data.js';

const root = document.querySelector('[data-skill-ledger-public-inventory]');
if (root) {
  initializePublicSkillLedgerInventory(root, [
    ...SOURCE_BOUND_PUBLIC_SKILL_RECORDS,
    ...CONTROLLED_PUBLIC_SKILL_RECORDS,
  ]);
}
