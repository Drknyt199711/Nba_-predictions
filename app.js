// app.js
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Specific actions when tabs are activated
            if (tabId === 'predict-game') {
                populateTeamSelects();
            } else if (tabId === 'teams-rosters') {
                updateRostersTab();
            } else if (tabId === 'all-teams') {
                renderAllTeamsTable();
            } else if (tabId === 'all-players') {
                renderAllPlayersTable();
            } else if (tabId === 'live-game-predictor') {
                updateLivePredictorTeams();
            }
        });
    });

    // Initial tab activation (Predict Game)
    document.querySelector('.tab-button[data-tab="predict-game"]').click();

    // --- Predict Game Tab Logic ---
    const homeTeamSelect = document.getElementById('home-team-select');
    const awayTeamSelect = document.getElementById('away-team-select');
    const predictGameButton = document.getElementById('predict-game-button');
    const predictedScoresElem = document.getElementById('predicted-scores');
    const winProbabilityElem = document.getElementById('win-probability');
    const predictionStatusMessage = document.querySelector('.prediction-status-message');
    const scoreDistributionChartCanvas = document.getElementById('score-distribution-chart').getContext('2d');
    let scoreChart; // To hold the Chart.js instance

    async function populateTeamSelects() {
        const teams = await dataManager.getCombinedTeams(); // dataManager will handle current vs combined logic
        homeTeamSelect.innerHTML = '<option value="">Select Home Team</option>';
        awayTeamSelect.innerHTML = '<option value="">Select Away Team</option>';

        teams.forEach(team => {
            const optionHome = document.createElement('option');
            optionHome.value = team.Team;
            optionHome.textContent = team.Team;
            homeTeamSelect.appendChild(optionHome);

            const optionAway = document.createElement('option');
            optionAway.value = team.Team;
            optionAway.textContent = team.Team;
            awayTeamSelect.appendChild(optionAway);
        });

        // Update live predictor team names if Predict Game tab is active
        updateLivePredictorTeams();
    }

    homeTeamSelect.addEventListener('change', updateRostersTab);
    awayTeamSelect.addEventListener('change', updateRostersTab);

    predictGameButton.addEventListener('click', async () => {
        const homeTeamName = homeTeamSelect.value;
        const awayTeamName = awayTeamSelect.value;

        if (!homeTeamName || !awayTeamName) {
            alert('Please select both home and away teams.');
            return;
        }
        if (homeTeamName === awayTeamName) {
            alert('Home and Away teams cannot be the same.');
            return;
        }

        predictGameButton.textContent = 'Predicting...';
        predictGameButton.disabled = true;

        // Determine data source and update status message
        const dataSourceInfo = await dataManager.getPredictionDataSourceInfo();
        predictionStatusMessage.textContent = `Predicting using ${dataSourceInfo}.`;

        try {
            const combinedData = await dataManager.getCombinedDataForPrediction(); // Get the combined/current data
            const homeTeam = combinedData.teams.find(t => t.Team === homeTeamName);
            const awayTeam = combinedData.teams.find(t => t.Team === awayTeamName);
            const allPlayers = combinedData.players;

            if (!homeTeam || !awayTeam) {
                alert('Team data not found for selected teams.');
                return;
            }

            // Get adjusted minutes for selected teams
            const homePlayersAdjustedMinutes = getAdjustedMinutes(homeTeamName);
            const awayPlayersAdjustedMinutes = getAdjustedMinutes(awayTeamName);

            // Run simulation
            const simulationResults = predictionEngine.runMultipleSimulations(
                1000, // Number of simulations
                homeTeam,
                awayTeam,
                allPlayers,
                homePlayersAdjustedMinutes,
                awayPlayersAdjustedMinutes
            );

            predictedScoresElem.textContent = `${homeTeamName}: ${simulationResults.avgHomeScore.toFixed(1)} - ${awayTeamName}: ${simulationResults.avgAwayScore.toFixed(1)}`;
            winProbabilityElem.textContent = `${homeTeamName}: ${(simulationResults.homeWinProbability * 100).toFixed(1)}% | ${awayTeamName}: ${(simulationResults.awayWinProbability * 100).toFixed(1)}%`;

            // Update chart
            if (scoreChart) {
                scoreChart.destroy();
            }
            scoreChart = new Chart(scoreDistributionChartCanvas, {
                type: 'bar',
                data: {
                    labels: simulationResults.scoreDistribution.labels,
                    datasets: [
                        {
                            label: `${homeTeamName} Scores`,
                            data: simulationResults.scoreDistribution.home,
                            backgroundColor: 'rgba(29, 66, 138, 0.6)', // Primary blue
                            borderColor: 'rgba(29, 66, 138, 1)',
                            borderWidth: 1
                        },
                        {
                            label: `${awayTeamName} Scores`,
                            data: simulationResults.scoreDistribution.away,
                            backgroundColor: 'rgba(201, 8, 42, 0.6)', // Secondary red
                            borderColor: 'rgba(201, 8, 42, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Score'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Frequency'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Prediction failed:', error);
            alert('Failed to run prediction. Please ensure data is imported and try again.');
        } finally {
            predictGameButton.textContent = 'Predict Game';
            predictGameButton.disabled = false;
        }
    });

    // Store manually adjusted minutes for current session
    let adjustedMinutes = {}; // { teamName: { playerName: minutes } }

    function getAdjustedMinutes(teamName) {
        return adjustedMinutes[teamName] || {};
    }

    function setAdjustedMinutes(teamName, playerName, minutes) {
        if (!adjustedMinutes[teamName]) {
            adjustedMinutes[teamName] = {};
        }
        adjustedMinutes[teamName][playerName] = minutes;
    }


    // --- Teams & Rosters Tab Logic ---
    const homeRosterBody = document.getElementById('home-roster-body');
    const awayRosterBody = document.getElementById('away-roster-body');
    const homeMinutesTotal = document.getElementById('home-minutes-total');
    const awayMinutesTotal = document.getElementById('away-minutes-total');
    const rostersHeader = document.getElementById('rosters-header');
    const homeRosterHeader = document.getElementById('home-roster-header');
    const awayRosterHeader = document.getElementById('away-roster-header');


    async function updateRostersTab() {
        const homeTeamName = homeTeamSelect.value;
        const awayTeamName = awayTeamSelect.value;

        homeRosterBody.innerHTML = '';
        awayRosterBody.innerHTML = '';
        homeMinutesTotal.textContent = '0';
        awayMinutesTotal.textContent = '0';
        homeMinutesTotal.classList.remove('warning', 'danger');
        awayMinutesTotal.classList.remove('warning', 'danger');


        if (!homeTeamName && !awayTeamName) {
            rostersHeader.textContent = 'Teams & Rosters (Please select teams in Predict Game tab)';
            homeRosterHeader.textContent = 'Home Team Roster';
            awayRosterHeader.textContent = 'Away Team Roster';
            return;
        }

        rostersHeader.textContent = `Rosters for: ${homeTeamName || 'N/A'} vs. ${awayTeamName || 'N/A'}`;
        homeRosterHeader.textContent = `Home Team Roster (${homeTeamName || 'N/A'})`;
        awayRosterHeader.textContent = `Away Team Roster (${awayTeamName || 'N/A'})`;


        const combinedData = await dataManager.getCombinedDataForPrediction();
        const allPlayers = combinedData.players;

        const populateRoster = (teamName, tbody, totalMinutesElement) => {
            const teamPlayers = allPlayers.filter(p => p.Team === teamName);
            let currentTotalMinutes = 0;
            tbody.innerHTML = '';

            teamPlayers.forEach(player => {
                const row = tbody.insertRow();
                row.insertCell().textContent = player.Player;
                row.insertCell().textContent = player.Pos;
                row.insertCell().textContent = player.PTS ? player.PTS.toFixed(1) : 'N/A';
                row.insertCell().textContent = player.MP ? player.MP.toFixed(1) : 'N/A';

                const minutesCell = row.insertCell();
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.classList.add('minutes-input');
                input.value = getAdjustedMinutes(teamName)[player.Player] || (player.MP ? Math.round(player.MP) : 0); // Use adjusted or default MP
                input.dataset.playerName = player.Player;
                input.dataset.teamName = teamName;
                minutesCell.appendChild(input);

                currentTotalMinutes += Number(input.value);

                input.addEventListener('input', (e) => {
                    let val = Number(e.target.value);
                    if (val < 0) val = 0; // Ensure non-negative
                    e.target.value = val;

                    setAdjustedMinutes(teamName, player.Player, val);
                    updateTotalMinutesDisplay(tbody, totalMinutesElement);
                });
            });
            updateTotalMinutesDisplay(tbody, totalMinutesElement); // Initial update
        };

        const updateTotalMinutesDisplay = (tbody, totalMinutesElement) => {
            let total = 0;
            tbody.querySelectorAll('.minutes-input').forEach(input => {
                total += Number(input.value) || 0;
            });
            totalMinutesElement.textContent = total;

            totalMinutesElement.classList.remove('warning', 'danger');
            if (total < 230 || total > 250) { // Warning for 10-20 min deviation
                totalMinutesElement.classList.add('warning');
            }
            if (total < 220 || total > 260) { // Danger for >20 min deviation
                totalMinutesElement.classList.add('danger');
            }
        };

        if (homeTeamName) populateRoster(homeTeamName, homeRosterBody, homeMinutesTotal);
        if (awayTeamName) populateRoster(awayTeamName, awayRosterBody, awayMinutesTotal);
    }


    // --- All Teams Tab Logic ---
    const allTeamsTableBody = document.getElementById('all-teams-body');
    const allTeamsSearch = document.getElementById('all-teams-search');

    async function renderAllTeamsTable() {
        const teams = await dataManager.getCombinedTeams(); // Use combined teams
        allTeamsTableBody.innerHTML = '';
        const searchTerm = allTeamsSearch.value.toLowerCase();

        const filteredTeams = teams.filter(team =>
            team.Team.toLowerCase().includes(searchTerm) ||
            (team['Team Abbreviation'] && team['Team Abbreviation'].toLowerCase().includes(searchTerm))
        );

        filteredTeams.forEach(team => {
            const row = allTeamsTableBody.insertRow();
            row.insertCell().textContent = team.Team;
            row.insertCell().textContent = team['Team Abbreviation'] || 'N/A'; // Assuming abbreviation field
            row.insertCell().textContent = team['Adjusted Defensive Rating'] ? team['Adjusted Defensive Rating'].toFixed(2) : 'N/A';
            // Add more cells for other team stats if available
        });
    }

    allTeamsSearch.addEventListener('input', renderAllTeamsTable);


    // --- All Players Tab Logic ---
    const allPlayersTableBody = document.getElementById('all-players-body');
    const allPlayersSearch = document.getElementById('all-players-search');

    async function renderAllPlayersTable() {
        const players = await dataManager.getCombinedPlayers(); // Use combined players
        allPlayersTableBody.innerHTML = '';
        const searchTerm = allPlayersSearch.value.toLowerCase();

        const filteredPlayers = players.filter(player =>
            player.Player.toLowerCase().includes(searchTerm) ||
            player.Team.toLowerCase().includes(searchTerm) ||
            (player.Pos && player.Pos.toLowerCase().includes(searchTerm))
        );

        filteredPlayers.forEach(player => {
            const row = allPlayersTableBody.insertRow();
            row.insertCell().textContent = player.Player;
            row.insertCell().textContent = player.Pos || 'N/A';
            row.insertCell().textContent = player.Team || 'N/A';
            row.insertCell().textContent = player.MP ? player.MP.toFixed(1) : 'N/A';
            row.insertCell().textContent = player.PTS ? player.PTS.toFixed(1) : 'N/A';
            row.insertCell().textContent = player['FG%'] ? (player['FG%'] * 100).toFixed(1) + '%' : 'N/A';
            row.insertCell().textContent = player['3P%'] ? (player['3P%'] * 100).toFixed(1) + '%' : 'N/A';
            row.insertCell().textContent = player['2P%'] ? (player['2P%'] * 100).toFixed(1) + '%' : 'N/A';
            row.insertCell().textContent = player['FT%'] ? (player['FT%'] * 100).toFixed(1) + '%' : 'N/A';
            // Add more cells for other player stats if available
        });
    }

    allPlayersSearch.addEventListener('input', renderAllPlayersTable);


    // --- Live Game Predictor Tab Logic ---
    const liveHomeTeamSpan = document.getElementById('live-home-team');
    const liveAwayTeamSpan = document.getElementById('live-away-team');
    const calculateLiveProbabilityButton = document.getElementById('calculate-live-probability');
    const liveQuarterSelect = document.getElementById('live-quarter');
    const liveTimeRemainingInput = document.getElementById('live-time-remaining');
    const liveHomeScoreInput = document.getElementById('live-home-score');
    const liveAwayScoreInput = document.getElementById('live-away-score');
    const liveWinProbabilityElem = document.getElementById('live-win-probability');

    function updateLivePredictorTeams() {
        const homeTeamName = homeTeamSelect.value;
        const awayTeamName = awayTeamSelect.value;
        liveHomeTeamSpan.textContent = `Home Team: ${homeTeamName || '[Select in Predict Game tab]'}`;
        liveAwayTeamSpan.textContent = `Away Team: ${awayTeamName || '[Select in Predict Game tab]'}`;
    }

    calculateLiveProbabilityButton.addEventListener('click', async () => {
        const homeTeamName = homeTeamSelect.value;
        const awayTeamName = awayTeamSelect.value;

        if (!homeTeamName || !awayTeamName || homeTeamName === awayTeamName) {
            alert('Please select valid and different teams in the "Predict Game" tab first.');
            return;
        }

        const currentQuarter = liveQuarterSelect.value;
        const timeRemainingStr = liveTimeRemainingInput.value;
        const currentHomeScore = parseInt(liveHomeScoreInput.value);
        const currentAwayScore = parseInt(liveAwayScoreInput.value);

        if (isNaN(currentHomeScore) || isNaN(currentAwayScore) || currentHomeScore < 0 || currentAwayScore < 0) {
            alert('Please enter valid non-negative scores.');
            return;
        }

        const timeParts = timeRemainingStr.split(':');
        if (timeParts.length !== 2 || isNaN(parseInt(timeParts[0])) || isNaN(parseInt(timeParts[1]))) {
            alert('Please enter time remaining in MM:SS format (e.g., 05:30).');
            return;
        }
        const minutes = parseInt(timeParts[0]);
        const seconds = parseInt(timeParts[1]);
        const totalSecondsRemaining = minutes * 60 + seconds;

        if (totalSecondsRemaining < 0) {
            alert('Time remaining cannot be negative.');
            return;
        }

        calculateLiveProbabilityButton.textContent = 'Calculating...';
        calculateLiveProbabilityButton.disabled = true;

        try {
            const combinedData = await dataManager.getCombinedDataForPrediction();
            const homeTeam = combinedData.teams.find(t => t.Team === homeTeamName);
            const awayTeam = combinedData.teams.find(t => t.Team === awayTeamName);
            const allPlayers = combinedData.players;

            const homePlayersAdjustedMinutes = getAdjustedMinutes(homeTeamName);
            const awayPlayersAdjustedMinutes = getAdjustedMinutes(awayTeamName);

            const liveSimulationResults = predictionEngine.runLiveGameSimulation(
                1000, // Number of simulations
                homeTeam,
                awayTeam,
                allPlayers,
                homePlayersAdjustedMinutes,
                awayPlayersAdjustedMinutes,
                currentQuarter,
                totalSecondsRemaining,
                currentHomeScore,
                currentAwayScore
            );

            liveWinProbabilityElem.textContent = `${homeTeamName}: ${(liveSimulationResults.homeWinProbability * 100).toFixed(1)}% | ${awayTeamName}: ${(liveSimulationResults.awayWinProbability * 100).toFixed(1)}%`;

        } catch (error) {
            console.error('Live prediction failed:', error);
            alert('Failed to run live prediction. Ensure teams are selected and data is imported.');
        } finally {
            calculateLiveProbabilityButton.textContent = 'Calculate Live Probability';
            calculateLiveProbabilityButton.disabled = false;
        }
    });


    // --- Data Import Tab Logic ---
    const importButtons = document.querySelectorAll('.import-button');
    const deleteButtons = document.querySelectorAll('.delete-button');
    const importStatusMessages = {
        current: { players: document.getElementById('current-import-status'), teams: document.getElementById('current-import-status') },
        ps1: { players: document.getElementById('ps1-import-status'), teams: document.getElementById('ps1-import-status') }
    };

    importButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            const type = event.target.dataset.type; // 'players' or 'teams'
            const season = event.target.dataset.season; // 'current' or 'ps1'
            const fileInputId = `${season}-${type}-file`;
            const fileInput = document.getElementById(fileInputId);
            const file = fileInput.files[0];
            const statusElem = importStatusMessages[season][type];

            if (!file) {
                statusElem.textContent = 'Please select a CSV file.';
                statusElem.style.color = 'var(--danger)';
                return;
            }

            statusElem.textContent = 'Importing...';
            statusElem.style.color = 'var(--info)';

            try {
                const text = await file.text();
                PapaParse.parse(text, {
                    header: true,
                    dynamicTyping: true, // Attempt to convert numbers
                    skipEmptyLines: true,
                    complete: async (results) => {
                        if (results.errors.length) {
                            console.error('CSV Parsing Errors:', results.errors);
                            statusElem.textContent = `CSV parsing errors: ${results.errors[0].message}`;
                            statusElem.style.color = 'var(--danger)';
                            return;
                        }

                        // Sanitize data before saving (e.g., ensure MP and PTS are numbers)
                        const processedData = results.data.map(row => {
                            for (const key in row) {
                                if (row[key] === '' || row[key] === null) {
                                    row[key] = null; // Normalize empty strings to null
                                }
                            }
                            // Specific conversions for numerical fields that might be strings
                            if (type === 'players') {
                                row.MP = parseFloat(row.MP) || 0;
                                row.PTS = parseFloat(row.PTS) || 0;
                                // Convert percentages from string "0.XXX" to float 0.XXX if needed, or ensure they are floats
                                if (typeof row['FG%'] === 'string' && row['FG%'].endsWith('%')) {
                                    row['FG%'] = parseFloat(row['FG%']) / 100;
                                } else {
                                    row['FG%'] = parseFloat(row['FG%']);
                                }
                                if (typeof row['3P%'] === 'string' && row['3P%'].endsWith('%')) {
                                    row['3P%'] = parseFloat(row['3P%']) / 100;
                                } else {
                                    row['3P%'] = parseFloat(row['3P%']);
                                }
                                if (typeof row['2P%'] === 'string' && row['2P%'].endsWith('%')) {
                                    row['2P%'] = parseFloat(row['2P%']) / 100;
                                } else {
                                    row['2P%'] = parseFloat(row['2P%']);
                                }
                                if (typeof row['FT%'] === 'string' && row['FT%'].endsWith('%')) {
                                    row['FT%'] = parseFloat(row['FT%']) / 100;
                                } else {
                                    row['FT%'] = parseFloat(row['FT%']);
                                }
                            } else if (type === 'teams') {
                                row['Adjusted Defensive Rating'] = parseFloat(row['Adjusted Defensive Rating']) || 0;
                            }
                            return row;
                        });


                        await dataManager.saveData(season, type, processedData);
                        statusElem.textContent = `Successfully imported ${processedData.length} ${type} for ${season} season.`;
                        statusElem.style.color = 'var(--success)';

                        // Refresh data-dependent tabs if active
                        if (document.getElementById('all-teams').classList.contains('active')) renderAllTeamsTable();
                        if (document.getElementById('all-players').classList.contains('active')) renderAllPlayersTable();
                        if (document.getElementById('predict-game').classList.contains('active')) populateTeamSelects();
                    }
                });
            } catch (error) {
                console.error('File import error:', error);
                statusElem.textContent = `Failed to read file: ${error.message}`;
                statusElem.style.color = 'var(--danger)';
            }
        });
    });

    deleteButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            const type = event.target.dataset.type;
            const season = event.target.dataset.season;
            const statusElem = importStatusMessages[season][type];

            if (confirm(`Are you sure you want to delete all ${type} data for the ${season} season? This cannot be undone.`)) {
                statusElem.textContent = 'Deleting...';
                statusElem.style.color = 'var(--info)';
                try {
                    await dataManager.deleteData(season, type);
                    statusElem.textContent = `Successfully deleted ${type} data for ${season} season.`;
                    statusElem.style.color = 'var(--success)';

                    // Refresh data-dependent tabs if active
                    if (document.getElementById('all-teams').classList.contains('active')) renderAllTeamsTable();
                    if (document.getElementById('all-players').classList.contains('active')) renderAllPlayersTable();
                    if (document.getElementById('predict-game').classList.contains('active')) populateTeamSelects();

                } catch (error) {
                    console.error('Delete operation failed:', error);
                    statusElem.textContent = `Failed to delete ${type} data: ${error.message}`;
                    statusElem.style.color = 'var(--danger)';
                }
            }
        });
    });


    // --- Initial Data Load and UI Setup ---
    // This will be called when the app first loads or when navigating to the tab
    // We already call populateTeamSelects() via the initial tab click.
});
