const API_URL = 'http://localhost:3001/api/v1';

// --- CONFIGURATION ---
// Please update these credentials to match a parent account in your local database
const EMAIL = 'parent@example.com';
const PASSWORD = 'password123';
// ---------------------

async function testUnlinking() {
    try {
        console.log('--- Starting Unlink Test ---');
        console.log(`Target API: ${API_URL}`);
        console.log(`User: ${EMAIL}`);

        // 1. Login
        console.log('\n1. Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        });

        if (!loginRes.ok) {
            const err = await loginRes.text();
            throw new Error(`Login failed (${loginRes.status}): ${err}`);
        }

        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('✅ Login successful.');

        // 2. Get Linked Children
        console.log('\n2. Fetching household links...');
        const linksRes = await fetch(`${API_URL}/household/links`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!linksRes.ok) {
            const err = await linksRes.text();
            throw new Error(`Failed to fetch links (${linksRes.status}): ${err}`);
        }

        const linksData = await linksRes.json();
        const links = linksData.data.links;

        if (links.length === 0) {
            console.log('⚠️ No linked children found. You need to link a child first before you can unlink them.');
            return;
        }

        console.log(`✅ Found ${links.length} active links.`);

        // Pick the first one
        const linkToUnlink = links[0];
        const childId = linkToUnlink.childId._id || linkToUnlink.childId;
        const childName = linkToUnlink.childId.firstName || 'Unknown';

        console.log(`\n3. Attempting to unlink child: ${childName} (ID: ${childId})`);

        // 3. Unlink
        const unlinkRes = await fetch(`${API_URL}/household/child/${childId}/unlink`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!unlinkRes.ok) {
            const err = await unlinkRes.json();
            throw new Error(`Unlink failed (${unlinkRes.status}): ${err.message}`);
        }

        const unlinkData = await unlinkRes.json();
        console.log('✅ Unlink successful!');
        console.log('Response:', unlinkData);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

testUnlinking();
