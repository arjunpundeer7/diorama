'use strict';

const { VERSION } = require('./version');
const catalog = require('./catalog');
const payload = require('./payload');
const workbench = require('./workbench');

module.exports = {
  VERSION,
  ...catalog,
  payload,
  workbench,
};
