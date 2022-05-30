import { ChildProcess, spawn } from "child_process"
import { DropHandler } from "./environment";
import { KeyCertPair } from "./certificates";
import { sleep } from "./sleep";
import { assignPort } from "./ports";

const MANIFEST_PATH = process.env.MANIFEST_PATH || "../Cargo.toml"
const SPAWNER_PATH = "../target/debug/spawner"
const CLUSTER_DOMAIN = "mydomain.test"

export async function killProcAndWait(proc: ChildProcess): Promise<void> {
    proc.kill("SIGTERM")
    await waitForExit(proc)
}

export function waitForExit(proc: ChildProcess): Promise<void> {
    return new Promise((accept, reject) => {
        proc.on('exit', () => {
            if (proc.exitCode === 0 || proc.signalCode) {
                accept()
            } else {
                reject(new Error(`Process exited with non-zero code ${proc.exitCode}`))
            }
        })
    })
}

export interface ServeResult {
    httpPort: number,
    httpsPort?: number,
}

export class DroneRunner implements DropHandler {
    server?: ChildProcess

    constructor(private dbPath: string) { }

    async drop() {
        if (this.server !== undefined) {
            await killProcAndWait(this.server)
        }
    }

    static build(): Promise<void> {
        let proc = spawn("cargo", ['build', '--manifest-path', MANIFEST_PATH], {
            stdio: 'inherit'
        })

        return waitForExit(proc)
    }

    async migrate() {
        let proc = spawn(SPAWNER_PATH, [
            "--db-path", this.dbPath,
            "--cluster-domain", CLUSTER_DOMAIN,
        ], {
            stdio: 'inherit'
        })

        await waitForExit(proc)
    }

    async serve(certs?: KeyCertPair): Promise<ServeResult> {
        const httpPort = assignPort()
        var httpsPort

        var args = [
            "--proxy",
            "--cluster-domain", CLUSTER_DOMAIN, 
            "--db-path", this.dbPath,
            "--http-port", httpPort.toString()
        ]

        if (certs !== undefined) {
            httpsPort = assignPort()

            args.push(
                "--https-port", httpsPort.toString(),
                "--https-private-key", certs.privateKeyPath,
                "--https-certificate", certs.certificatePath,
            )
        }

        let proc = spawn(SPAWNER_PATH, args, {
            stdio: 'inherit'
        })

        proc.on("exit", (code) => {
            if (code !== null) {
                // Server process should not exit until we kill it.
                throw new Error(`Process exited with code ${code}.`)
            }
        })

        this.server = proc
        await sleep(500)

        return { httpPort, httpsPort }
    }
}