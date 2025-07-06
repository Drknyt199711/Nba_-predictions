// dataManager.js
const dataManager = (() => {
    const DB_NAME = 'NBAPredictorDB';
    const DB_VERSION = 1;
    const STORE_NAMES = {
        current: {
            players: 'players_current',
            teams: 'teams_current'
        },
        ps1: {
            players: 'players_ps1',
            teams: 'teams_ps1'
        }
    };

    let db;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                db = event.target.result;
                // Create object stores for current and PS-1 data
                for (const seasonKey in STORE_NAMES) {
                    for (const typeKey in STORE_NAMES[seasonKey]) {
                        const storeName = STORE_NAMES[seasonKey][typeKey];
                        // Determine keyPath based on type for simplicity.
                        // 'Player' for player data, 'Team' for team data.
                        const keyPath = (typeKey === 'players') ? 'Player' : 'Team';
                        if (!db.objectStoreNames.contains(storeName)) {
                            db.createObjectStore(storeName, { keyPath: keyPath });
                        }
                    }
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.errorCode);
                reject('Error opening database');
            };
        });
    }

    async function getStore(season, type, mode = 'readonly') {
        if (!db) {
            db = await openDB();
        }
        const storeName = STORE_NAMES[season]?.[type];
        if (!storeName) {
            throw new Error(`Invalid season or type: ${season}, ${type}`);
        }
        const transaction = db.transaction([storeName], mode);
        return transaction.objectStore(storeName);
    }

    async function saveData(season, type, data) {
        const store = await getStore(season, type, 'readwrite');
        return new Promise((resolve, reject) => {
            // Clear existing data for replacement
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                const addRequests = [];
                data.forEach(item => {
                    addRequests.push(store.add(item));
                });

                Promise.all(addRequests.map(req => new Promise((res, rej) => {
                    req.onsuccess = res;
                    req.onerror = rej;
                })))
                .then(() => resolve())
                .catch(error => reject(error));
            };
            clearRequest.onerror = (event) => reject(event.target.error);
        });
    }

    async function getData(season, type) {
        const store = await getStore(season, type, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function deleteData(season, type) {
        const store = await getStore(season, type, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // --- Data Combination Logic ---
    async function getCombinedPlayers() {
        const currentPlayers = await getData('current', 'players') || [];
        const ps1Players = await getData('ps1', 'players') || [];

        if (ps1Players.length === 0) {
            return currentPlayers; // If no PS-1 data, use current
        }

        const combinedPlayersMap = new Map();

        // Add current players
        currentPlayers.forEach(p => {
            combinedPlayersMap.set(p.Player, { ...p, source: 'current' });
        });

        // Combine with PS-1 players
        ps1Players.forEach(p_ps1 => {
            if (combinedPlayersMap.has(p_ps1.Player)) {
                // Player exists in current season, average stats
                const p_current = combinedPlayersMap.get(p_ps1.Player);
                const combinedPlayer = { ...p_current }; // Start with current player's data

                // Prioritize Current Season Team if changed
                // The 'Team' key from current season is already set by the first loop.
                // No need to change it unless it's explicitly needed to be averaged (which is not desired for 'Team' field).

                // Average numerical stats
                const statsToAverage = ['MP', 'PTS', 'FGA', '3PA', '2PA', 'FTA', 'FG%', '3P%', '2P%', 'FT%'];
                statsToAverage.forEach(stat => {
                    // Only average if both values exist and are valid numbers
                    const currentVal = parseFloat(p_current[stat]);
                    const ps1Val = parseFloat(p_ps1[stat]);

                    if (!isNaN(currentVal) && !isNaN(ps1Val)) {
                        combinedPlayer[stat] = (currentVal + ps1Val) / 2;
                    } else if (!isNaN(ps1Val)) {
                        combinedPlayer[stat] = ps1Val; // Use PS-1 if current is missing/invalid
                    }
                    // If PS-1 is missing/invalid, current is already set.
                });
                combinedPlayersMap.set(p_ps1.Player, combinedPlayer);
            } else {
                // Player only exists in PS-1
                combinedPlayersMap.set(p_ps1.Player, { ...p_ps1, source: 'ps1' });
            }
        });

        return Array.from(combinedPlayersMap.values());
    }

    async function getCombinedTeams() {
        const currentTeams = await getData('current', 'teams') || [];
        const ps1Teams = await getData('ps1', 'teams') || [];

        if (ps1Teams.length === 0) {
            return currentTeams; // If no PS-1 data, use current
        }

        const combinedTeamsMap = new Map();

        // Add current teams
        currentTeams.forEach(t => {
            combinedTeamsMap.set(t.Team, { ...t, source: 'current' });
        });

        // Combine with PS-1 teams
        ps1Teams.forEach(t_ps1 => {
            if (combinedTeamsMap.has(t_ps1.Team)) {
                // Team exists in current season, average stats
                const t_current = combinedTeamsMap.get(t_ps1.Team);
                const combinedTeam = { ...t_current };

                // Average numerical stats, specifically Defensive Rating
                const currentDRtg = parseFloat(t_current['Adjusted Defensive Rating']);
                const ps1DRtg = parseFloat(t_ps1['Adjusted Defensive Rating']);

                if (!isNaN(currentDRtg) && !isNaN(ps1DRtg)) {
                    combinedTeam['Adjusted Defensive Rating'] = (currentDRtg + ps1DRtg) / 2;
                } else if (!isNaN(ps1DRtg)) {
                    combinedTeam['Adjusted Defensive Rating'] = ps1DRtg;
                }
                // Add logic for other team stats if they exist

                combinedTeamsMap.set(t_ps1.Team, combinedTeam);
            } else {
                // Team only exists in PS-1
                combinedTeamsMap.set(t_ps1.Team, { ...t_ps1, source: 'ps1' });
            }
        });

        return Array.from(combinedTeamsMap.values());
    }

    async function getCombinedDataForPrediction() {
        const players = await getCombinedPlayers();
        const teams = await getCombinedTeams();
        return { players, teams };
    }

    async function getPredictionDataSourceInfo() {
        const currentPlayers = await getData('current', 'players') || [];
        const ps1Players = await getData('ps1', 'players') || [];

        if (currentPlayers.length > 0 && ps1Players.length > 0) {
            return 'combined Current & PS-1 data';
        } else if (currentPlayers.length > 0) {
            return 'Current Season data only';
        } else if (ps1Players.length > 0) {
            return 'PS-1 Season data only (Current data not found)';
        } else {
            return 'no data available. Please import data.';
        }
    }

    // Initialize DB on script load
    openDB().catch(error => console.error("Failed to open IndexedDB:", error));


    return {
        saveData,
        getData,
        deleteData,
        getCombinedPlayers,
        getCombinedTeams,
        getCombinedDataForPrediction,
        getPredictionDataSourceInfo
    };
})();
