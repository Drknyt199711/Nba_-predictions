// predictionEngine.js
const predictionEngine = (() => {

    const LEAGUE_AVG_DRTG_A = 100.0; // Placeholder: Actual average needs to be defined or dynamically calculated

    // Helper to get Gaussian random number
    function gaussianRandom(mean = 0, stdev = 1) {
        let u = 1 - Math.random(); // Converting [0,1) to (0,1]
        let v = 1 - Math.random();
        let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return z * stdev + mean;
    }

    function getDefenseFactor(teamDRtgA) {
        if (!teamDRtgA || teamDRtgA === 0) {
            return 1.0; // Default to no effect if rating is missing or zero
        }
        return LEAGUE_AVG_DRTG_A / teamDRtgA;
    }

    function simulatePlayerPoints(playerStats, expectedMinutes, opponentDefenseFactor) {
        if (!playerStats || !playerStats.MP || playerStats.MP <= 0 || !playerStats.PTS || expectedMinutes <= 0) {
            return 0; // Player not playing or missing key stats, or minutes are zero/negative
        }

        const basePointsPerMinute = playerStats.PTS / playerStats.MP;
        let expectedRawPoints = basePointsPerMinute * expectedMinutes;

        // Apply defense adjustment
        const adjustedPoints = expectedRawPoints * opponentDefenseFactor;

        // Add randomness - standard deviation as a percentage of adjusted points
        const stdDev = Math.max(2, adjustedPoints * 0.15); // Min 2 points std dev
        let simulatedPoints = gaussianRandom(adjustedPoints, stdDev);

        return Math.max(0, Math.round(simulatedPoints)); // Ensure non-negative integer
    }

    function runGameSimulation(homeTeam, awayTeam, allPlayers, homePlayersAdjustedMinutes, awayPlayersAdjustedMinutes) {
        const homeDefenseFactor = getDefenseFactor(awayTeam['Adjusted Defensive Rating']); // Opponent's defensive rating affects points scored
        const awayDefenseFactor = getDefenseFactor(homeTeam['Adjusted Defensive Rating']);

        let homeScore = 0;
        let awayScore = 0;

        // Simulate home team player points
        for (const playerName in homePlayersAdjustedMinutes) {
            const player = allPlayers.find(p => p.Player === playerName && p.Team === homeTeam.Team);
            if (player) {
                homeScore += simulatePlayerPoints(player, homePlayersAdjustedMinutes[playerName], homeDefenseFactor);
            }
        }

        // Simulate away team player points
        for (const playerName in awayPlayersAdjustedMinutes) {
            const player = allPlayers.find(p => p.Player === playerName && p.Team === awayTeam.Team);
            if (player) {
                awayScore += simulatePlayerPoints(player, awayPlayersAdjustedMinutes[playerName], awayDefenseFactor);
            }
        }

        // Handle Overtime
        if (homeScore === awayScore) {
            // Simple overtime: add random points to one team
            if (Math.random() > 0.5) {
                homeScore += Math.floor(Math.random() * 5) + 1; // 1-5 points
            } else {
                awayScore += Math.floor(Math.random() * 5) + 1;
            }
            // Could implement more complex overtime simulation with scaled minutes if needed
        }

        return { homeScore, awayScore };
    }

    function runMultipleSimulations(numSimulations, homeTeam, awayTeam, allPlayers, homePlayersAdjustedMinutes, awayPlayersAdjustedMinutes) {
        let homeWins = 0;
        let awayWins = 0;
        const homeScores = [];
        const awayScores = [];

        for (let i = 0; i < numSimulations; i++) {
            const result = runGameSimulation(homeTeam, awayTeam, allPlayers, homePlayersAdjustedMinutes, awayPlayersAdjustedMinutes);
            homeScores.push(result.homeScore);
            awayScores.push(result.awayScore);

            if (result.homeScore > result.awayScore) {
                homeWins++;
            } else {
                awayWins++;
            }
        }

        const avgHomeScore = homeScores.reduce((a, b) => a + b, 0) / numSimulations;
        const avgAwayScore = awayScores.reduce((a, b) => a + b, 0) / numSimulations;

        const homeWinProbability = homeWins / numSimulations;
        const awayWinProbability = awayWins / numSimulations;

        // For Score Distribution Chart
        const allScores = [...homeScores, ...awayScores];
        const minScore = Math.min(...allScores);
        const maxScore = Math.max(...allScores);
        const binSize = 5; // Group scores into bins of 5 points
        const numBins = Math.ceil((maxScore - minScore + 1) / binSize);

        const homeScoreBins = new Array(numBins).fill(0);
        const awayScoreBins = new Array(numBins).fill(0);
        const labels = [];

        for (let i = 0; i < numBins; i++) {
            const lowerBound = minScore + i * binSize;
            const upperBound = lowerBound + binSize - 1;
            labels.push(`${lowerBound}-${upperBound}`);

            homeScores.forEach(score => {
                if (score >= lowerBound && score <= upperBound) {
                    homeScoreBins[i]++;
                }
            });
            awayScores.forEach(score => {
                if (score >= lowerBound && score <= upperBound) {
                    awayScoreBins[i]++;
                }
            });
        }

        return {
            avgHomeScore,
            avgAwayScore,
            homeWinProbability,
            awayWinProbability,
            scoreDistribution: {
                labels: labels,
                home: homeScoreBins,
                away: awayScoreBins
            }
        };
    }

    function runLiveGameSimulation(numSimulations, homeTeam, awayTeam, allPlayers, homePlayersAdjustedMinutes, awayPlayersAdjustedMinutes, currentQuarter, totalSecondsRemaining, currentHomeScore, currentAwayScore) {

        // Determine remaining game time in minutes
        let remainingMinutesEquivalent = 0;
        const quarterLength = 12 * 60; // 12 minutes per quarter in seconds
        const otLength = 5 * 60; // 5 minutes per overtime in seconds
        const totalRegulationMinutes = 48; // 4 quarters * 12 mins

        if (currentQuarter === '1') {
            remainingMinutesEquivalent = (3 * quarterLength + totalSecondsRemaining) / 60;
        } else if (currentQuarter === '2') {
            remainingMinutesEquivalent = (2 * quarterLength + totalSecondsRemaining) / 60;
        } else if (currentQuarter === '3') {
            remainingMinutesEquivalent = (1 * quarterLength + totalSecondsRemaining) / 60;
        } else if (currentQuarter === '4') {
            remainingMinutesEquivalent = totalSecondsRemaining / 60;
        } else if (currentQuarter.startsWith('OT')) {
            const otNumber = parseInt(currentQuarter.replace('OT', ''));
            remainingMinutesEquivalent = ((otNumber - 1) * otLength + totalSecondsRemaining) / 60; // Minutes from start of OT1
        } else {
             // Fallback: If quarter is unknown, assume a full game equivalent remaining.
             // This is a robust fallback, ensuring prediction attempts even with bad input.
             remainingMinutesEquivalent = totalRegulationMinutes;
        }

        // If no meaningful time left, use current scores as final
        if (remainingMinutesEquivalent <= 0) {
            return {
                homeWinProbability: currentHomeScore > currentAwayScore ? 1 : 0,
                awayWinProbability: currentAwayScore > currentHomeScore ? 1 : 0,
                avgHomeScore: currentHomeScore,
                avgAwayScore: currentAwayScore,
            };
        }

        let homeWins = 0;
        let awayWins = 0;

        const homeDefenseFactor = getDefenseFactor(awayTeam['Adjusted Defensive Rating']);
        const awayDefenseFactor = getDefenseFactor(homeTeam['Adjusted Defensive Rating']);

        for (let i = 0; i < numSimulations; i++) {
            let simulatedHomeScoreRemaining = 0;
            let simulatedAwayScoreRemaining = 0;

            // Scale player minutes and points for remaining time
            for (const playerName in homePlayersAdjustedMinutes) {
                const player = allPlayers.find(p => p.Player === playerName && p.Team === homeTeam.Team);
                if (player) {
                    // Scale player's *per game adjusted minutes* to the *remaining minutes equivalent*
                    const scaledMinutes = (homePlayersAdjustedMinutes[playerName] / totalRegulationMinutes) * remainingMinutesEquivalent;
                    simulatedHomeScoreRemaining += simulatePlayerPoints(player, scaledMinutes, homeDefenseFactor);
                }
            }

            for (const playerName in awayPlayersAdjustedMinutes) {
                const player = allPlayers.find(p => p.Player === playerName && p.Team === awayTeam.Team);
                if (player) {
                    const scaledMinutes = (awayPlayersAdjustedMinutes[playerName] / totalRegulationMinutes) * remainingMinutesEquivalent;
                    simulatedAwayScoreRemaining += simulatePlayerPoints(player, scaledMinutes, awayDefenseFactor);
                }
            }
            
            let finalHomeScore = currentHomeScore + simulatedHomeScoreRemaining;
            let finalAwayScore = currentAwayScore + simulatedAwayScoreRemaining;

            // Handle potential overtime from the simulated remaining part if scores are tied
            if (finalHomeScore === finalAwayScore) {
                // Another round of simple overtime points if still tied after adding simulated remaining points
                if (Math.random() > 0.5) {
                    finalHomeScore += Math.floor(Math.random() * 5) + 1;
                } else {
                    finalAwayScore += Math.floor(Math.random() * 5) + 1;
                }
            }

            if (finalHomeScore > finalAwayScore) {
                homeWins++;
            } else {
                awayWins++;
            }
        }

        return {
            homeWinProbability: homeWins / numSimulations,
            awayWinProbability: awayWins / numSimulations
        };
    }


    return {
        getDefenseFactor,
        simulatePlayerPoints,
        runGameSimulation,
        runMultipleSimulations,
        runLiveGameSimulation
    };
})();
