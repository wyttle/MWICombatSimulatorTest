
let activeChildWorkers = [];

onmessage = async function (event) {
    switch (event.data.type) {
        case "stop":
            for (const w of activeChildWorkers) {
                w.terminate();
            }
            activeChildWorkers = [];
            break;

        case "start_simulation_all_zones":
            const zoneHrids = event.data.zones;
            let zoneProgress = Object.fromEntries(zoneHrids.map(zone => [zone.zoneHrid+'#'+zone.difficultyTier, 0]));

            activeChildWorkers = [];

            try {
                const maxWorkers = navigator.hardwareConcurrency;
                console.log("maxWorkers: " + maxWorkers);

                const taskQueue = [...zoneHrids];
                let nextIndex = 0;
                const results = new Array(zoneHrids.length);
                const outer_worker = this;
                let reportedProgress = 0;

                const processTask = async (workerId) => {
                    while (taskQueue.length > 0) {
                        const zoneIndex = nextIndex++;
                        const currentZone = taskQueue.shift();

                        const simulationWorker = new Worker(new URL('worker.js', import.meta.url));
                        activeChildWorkers.push(simulationWorker);

                        let workerMessage = {
                            type: "start_simulation",
                            players: event.data.players,
                            zone: currentZone,
                            extra: event.data.extra,
                            guildShrineLevels: event.data.guildShrineLevels,
                            simulationTimeLimit: event.data.simulationTimeLimit,
                        };
                        simulationWorker.postMessage(workerMessage);
                        
                        const result = await new Promise((resolve, reject) => {
                            simulationWorker.onmessage = function (event) {
                                if (event.data.type === "simulation_result") {
                                    zoneProgress[event.data.zone+'#'+event.data.difficultyTier] = 1.0;
                                    resolve(event.data.simResult);
                                } else if (event.data.type === "simulation_progress") {
                                    zoneProgress[event.data.zone+'#'+event.data.difficultyTier] = event.data.progress;
                                    let totalProgress = Object.values(zoneProgress).reduce((acc, progress) => acc + progress, 0) / Object.keys(zoneProgress).length;
                                    if (totalProgress >= reportedProgress) {
                                        reportedProgress = totalProgress;
                                        outer_worker.postMessage({ type: "simulation_progress", progress: totalProgress });
                                    }
                                } else if (event.data.type === "simulation_error") {
                                    reject(event.data.error);
                                }
                            };
                        });

                        results[zoneIndex] = result;
                        simulationWorker.terminate();
                    }
                };

                const workers = Array(Math.min(maxWorkers, zoneHrids.length))
                    .fill()
                    .map((_, index) => processTask(index));

                await Promise.all(workers);
                activeChildWorkers = [];

                this.postMessage({ type: "simulation_result_allZones", simResults: results });
            } catch (e) {
                console.log(e);
                for (const w of activeChildWorkers) {
                    w.terminate();
                }
                activeChildWorkers = [];
                this.postMessage({ type: "simulation_error", error: e });
            }
            break;
        case "start_simulation_all_labyrinths":
            const labyrinthHrids = event.data.labyrinths;
            let labyrinthProgress = Object.fromEntries(labyrinthHrids.map(labyrinth => [labyrinth.labyrinthHrid+'#'+labyrinth.roomLevel, 0]));
            
            activeChildWorkers = [];

            try {
                const maxWorkersLab = navigator.hardwareConcurrency;
                console.log("maxWorkers: " + maxWorkersLab);

                const labTaskQueue = [...labyrinthHrids];
                let nextLabIndex = 0;
                const labResults = new Array(labyrinthHrids.length);
                const outer_worker_lab = this;
                let reportedLabProgress = 0;

                const processLabTask = async (workerId) => {
                    while (labTaskQueue.length > 0) {
                        const labyrinthIndex = nextLabIndex++;
                        const currentLabyrinth = labTaskQueue.shift();

                        const simulationWorker = new Worker(new URL('worker.js', import.meta.url));
                        activeChildWorkers.push(simulationWorker);

                        let workerMessage = {
                            type: "start_simulation",
                            players: event.data.players,
                            labyrinth: currentLabyrinth,
                            extra: event.data.extra,
                            guildShrineLevels: event.data.guildShrineLevels,
                            simulationTimeLimit: event.data.simulationTimeLimit,
                        };
                        simulationWorker.postMessage(workerMessage);
                        
                        const result = await new Promise((resolve, reject) => {
                            simulationWorker.onmessage = function (event) {
                                if (event.data.type === "simulation_result") {
                                    labyrinthProgress[currentLabyrinth.labyrinthHrid+'#'+currentLabyrinth.roomLevel] = 1.0;
                                    resolve(event.data.simResult);
                                } else if (event.data.type === "simulation_progress") {
                                    labyrinthProgress[currentLabyrinth.labyrinthHrid+'#'+currentLabyrinth.roomLevel] = event.data.progress;
                                    let totalProgress = Object.values(labyrinthProgress).reduce((acc, progress) => acc + progress, 0) / Object.keys(labyrinthProgress).length;
                                    if (totalProgress >= reportedLabProgress) {
                                        reportedLabProgress = totalProgress;
                                        outer_worker_lab.postMessage({ type: "simulation_progress", progress: totalProgress });
                                    }
                                } else if (event.data.type === "simulation_error") {
                                    reject(event.data.error);
                                }
                            };
                        });

                        labResults[labyrinthIndex] = result;
                        simulationWorker.terminate();
                    }
                };

                const labWorkers = Array(Math.min(maxWorkersLab, labyrinthHrids.length))
                    .fill()
                    .map((_, index) => processLabTask(index));

                await Promise.all(labWorkers);
                activeChildWorkers = [];

                this.postMessage({ type: "simulation_result_allLabyrinths", simResults: labResults });
            } catch (e) {
                console.log(e);
                for (const w of activeChildWorkers) {
                    w.terminate();
                }
                activeChildWorkers = [];
                this.postMessage({ type: "simulation_error", error: e });
            }
            break;
    }
};
