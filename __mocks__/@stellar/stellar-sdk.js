/**
 * Manual mock for @stellar/stellar-sdk.
 * Used by Jest API tests so we don't need the real stellar-sdk ESM chain.
 */
'use strict';

// Valid Stellar base32 alphabet (uppercase A-Z and digits 2-7)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let _keyCounter = 0;

function makeKey(n) {
  // Encode n into base32-like string to make each key unique
  let suffix = '';
  let val = n;
  for (let i = 0; i < 54; i++) {
    suffix = BASE32_CHARS[val % BASE32_CHARS.length] + suffix;
    val = Math.floor(val / BASE32_CHARS.length) + 1;
  }
  return `G${suffix}`;
}

const Keypair = {
  random: () => {
    const key = makeKey(++_keyCounter);
    return {
      publicKey: () => key,
      secret: () => `S${key.slice(1)}`,
    };
  },
  fromPublicKey: (key) => ({ publicKey: () => key }),
};

const StrKey = {
  decodeEd25519PublicKey: (key) => Buffer.alloc(32, 0),
  isValidEd25519PublicKey: (key) => typeof key === 'string' && key.startsWith('G'),
};

const Networks = {
  TESTNET: 'Test SDF Network ; September 2015',
  PUBLIC: 'Public Global Stellar Network ; September 2015',
};

const Contract = jest.fn().mockImplementation(() => ({
  call: jest.fn().mockReturnValue({}),
}));

const Account = jest.fn().mockImplementation(() => ({}));
const TransactionBuilder = jest.fn().mockImplementation(() => ({
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({}),
}));

const Address = jest.fn().mockImplementation((addr) => ({
  toScVal: jest.fn().mockReturnValue({}),
}));

const nativeToScVal = jest.fn().mockReturnValue({});
const scValToNative = jest.fn().mockReturnValue(0);
const xdr = { ScVal: {} };

const SorobanRpc = {
  Server: jest.fn().mockImplementation(() => ({
    simulateTransaction: jest.fn().mockResolvedValue({
      result: { retval: {} },
      minResourceFee: '100',
      transactionData: {
        build: jest.fn().mockReturnValue({
          resources: jest.fn().mockReturnValue({
            instructions: jest.fn().mockReturnValue(0),
            readBytes: jest.fn().mockReturnValue(0),
            writeBytes: jest.fn().mockReturnValue(0),
          }),
        }),
      },
    }),
    sendTransaction: jest.fn().mockResolvedValue({ hash: 'mock-hash', status: 'PENDING' }),
    getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    getContractData: jest.fn().mockResolvedValue(null),
    getEvents: jest.fn().mockResolvedValue({ events: [] }),
  })),
  Durability: { Persistent: 'persistent', Temporary: 'temporary' },
  Api: {
    isSimulationError: jest.fn().mockReturnValue(false),
  },
};

module.exports = {
  Keypair,
  StrKey,
  Networks,
  Contract,
  Account,
  TransactionBuilder,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  SorobanRpc,
  Soroban: SorobanRpc,
};
