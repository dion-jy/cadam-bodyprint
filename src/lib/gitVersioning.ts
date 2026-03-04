import git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';

const fs = new LightningFS('cadam-projects');
const pfs = fs.promises;

export type VersionCommit = {
  oid: string;
  message: string;
  timestamp: number;
  code: string;
};

function projectDir(conversationId: string) {
  return `/project-${conversationId}`;
}

async function ensureRepo(conversationId: string): Promise<string> {
  const dir = projectDir(conversationId);
  try {
    await pfs.stat(dir);
  } catch {
    await pfs.mkdir(dir);
    await git.init({ fs, dir });
  }
  return dir;
}

export async function commitVersion(
  conversationId: string,
  code: string,
  message: string,
  author: { name: string; email: string },
): Promise<string> {
  const dir = await ensureRepo(conversationId);

  await pfs.writeFile(`${dir}/model.scad`, code, 'utf8');

  await git.add({ fs, dir, filepath: 'model.scad' });

  // Check if there are actual changes to commit
  const status = await git.status({ fs, dir, filepath: 'model.scad' });
  if (status === 'unmodified') {
    // No changes, return latest commit OID
    const log = await git.log({ fs, dir, depth: 1 });
    return log[0]?.oid ?? '';
  }

  const oid = await git.commit({
    fs,
    dir,
    message,
    author: {
      name: author.name,
      email: author.email,
    },
  });

  return oid;
}

export async function getHistory(
  conversationId: string,
): Promise<VersionCommit[]> {
  const dir = projectDir(conversationId);

  try {
    await pfs.stat(dir);
  } catch {
    return [];
  }

  try {
    const commits = await git.log({ fs, dir });

    const versions: VersionCommit[] = await Promise.all(
      commits.map(async (commit) => {
        let code = '';
        try {
          const { blob } = await git.readBlob({
            fs,
            dir,
            oid: commit.oid,
            filepath: 'model.scad',
          });
          code = new TextDecoder().decode(blob);
        } catch {
          // File may not exist in early commits
        }

        return {
          oid: commit.oid,
          message: commit.commit.message,
          timestamp: commit.commit.author.timestamp * 1000,
          code,
        };
      }),
    );

    return versions;
  } catch {
    return [];
  }
}

export async function getVersionCode(
  conversationId: string,
  oid: string,
): Promise<string> {
  const dir = projectDir(conversationId);

  const { blob } = await git.readBlob({
    fs,
    dir,
    oid,
    filepath: 'model.scad',
  });

  return new TextDecoder().decode(blob);
}

export async function diffVersions(
  conversationId: string,
  oldOid: string,
  newOid: string,
): Promise<{ oldCode: string; newCode: string }> {
  const [oldCode, newCode] = await Promise.all([
    getVersionCode(conversationId, oldOid),
    getVersionCode(conversationId, newOid),
  ]);

  return { oldCode, newCode };
}
