// Supabase client singleton
// Reads configuration from environment variables.
// SUPABASE_URL – Project URL (e.g. https://xxxx.supabase.co)
// SUPABASE_SERVICE_KEY – Service role secret (server‑side privileged key)

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// In-memory store for test mode (persists across DAO calls within a test session)
const testStore = {
  records: [],
  profiles: [],
  appointments: [],
  reminders: [],
  doctors: [],
};

// In test mode, return a mock client with an in-memory store
if (process.env.NODE_ENV === 'test') {
  const mock = {
    testStore,

    from(table) {
      const chain = [];
      const obj = {};

      obj.select = function() { chain.push(['select']); return obj; };
      obj.insert = function(payload) { chain.push(['insert', payload]); return obj; };
      obj.update = function(payload) { chain.push(['update', payload]); return obj; };
      obj.delete = function() { chain.push(['delete']); return obj; };
      obj.eq = function(col, val) { chain.push(['eq', col, val]); return obj; };

      obj.single = async function() {
        const hasInsert = chain.some(c => c[0] === 'insert');
        if (hasInsert) {
          const rec = chain.find(c => c[0] === 'insert');
          const id = 'test-record-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
          if (rec && rec[1] && rec[1].user_id) {
            const record = { id, ...rec[1], created_at: new Date().toISOString() };
            testStore.records.push(record);
            return { data: { id }, error: null };
          }
          return { data: { id }, error: null };
        }
        const eqEntry = chain.find(c => c[0] === 'eq');
        if (eqEntry && eqEntry[1]) {
          const [, col, val] = eqEntry;
          const filtered = (testStore[table] || []).filter(r => r[col] === val);
          return { data: filtered, error: null };
        }
        return { data: testStore[table] || [], error: null };
      };

      // also expose .then() for plain promise consumers
      obj.then = function(resolve) { return Promise.resolve({ data: testStore[table] || [], error: null }).then(resolve); };

      return obj;
    },

    auth: {
      signUp: () => Promise.resolve({
        data: { user: { id: 'test-user-' + Date.now(), user_metadata: { role: 'student' } } },
        error: null
      }),
      signInWithPassword: () => Promise.resolve({
        data: {
          user: { id: 'test-user', user_metadata: { role: 'student' } },
          session: { access_token: 'test-token', refresh_token: 'test-refresh' }
        },
        error: null
      }),
      refreshSession: () => Promise.resolve({
        data: { user: { id: 'test-user' }, session: { access_token: 'new-token' } },
        error: null
      }),
      getUser: () => Promise.resolve({
        data: { user: { id: 'test-user', user_metadata: { role: 'student' } } },
        error: null
      }),
    },

    __testMode__: true,
  };

  module.exports = mock;
} else if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase configuration missing: set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
} else {
  const supabase = createClient(supabaseUrl, supabaseKey);
  module.exports = supabase;
}