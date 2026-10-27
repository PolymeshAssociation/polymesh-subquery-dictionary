import { SubstrateBlock, SubstrateExtrinsic } from "@subql/types";
import { Event, Extrinsic, SpecVersion } from "../types";

// Spec versions are read from the chain, not from `block.specVersion`: the node labels a whole
// batch with one spec, so a label can lag an upgrade by up to a batch.
const specAt = async (hash: SubstrateBlock["block"]["header"]["hash"]): Promise<string> =>
  (await api.rpc.state.getRuntimeVersion(hash)).specVersion.toString();

let specRecorded = false;
export async function handleBlock(block: SubstrateBlock): Promise<void> {
  const { hash, parentHash, number } = block.block.header;
  const height = number.toBigInt();

  // The first block this process sees: its spec is the one its parent's state holds
  if (!specRecorded) {
    const current = await specAt(parentHash);
    if (!(await SpecVersion.get(current))) {
      await new SpecVersion(current, height).save();
    }
    specRecorded = true;
  }

  // An upgrade stored in this block runs from the next one, and this block's state holds it
  const upgraded = block.events.some(
    ({ event }) => event.section === "system" && event.method === "CodeUpdated"
  );
  if (upgraded) {
    const [ran, next] = await Promise.all([specAt(parentHash), specAt(hash)]);
    if (next !== ran) {
      await new SpecVersion(next, height + BigInt(1)).save();
    }
  }

  // Process all events in block
  const events = block.events
    .filter(
      (evt) =>
        !(evt.event.section === "system" &&
          evt.event.method === "ExtrinsicSuccess")
    )
    .map((evt, idx) =>
      handleEvent(block.block.header.number.toString(), idx, evt)
    );

  // Process all calls in block
  const calls = wrapExtrinsics(block).map((ext, idx) =>
    handleCall(`${block.block.header.number.toString()}-${idx}`, ext)
  );

  // Save all data
  await Promise.all([
    store.bulkCreate("Event", events),
    store.bulkCreate("Extrinsic", calls),
  ]);
}

function handleEvent(
  blockNumber: string,
  eventIdx: number,
  event: SubstrateBlock["events"][number]
): Event {
  const newEvent = new Event(`${blockNumber}-${eventIdx}`, event.event.section, event.event.method, BigInt(blockNumber));
  return newEvent;
}

function handleCall(idx: string, extrinsic: SubstrateExtrinsic): Extrinsic {
  const newExtrinsic = new Extrinsic(
    idx,
    extrinsic.extrinsic.hash.toString(),
    extrinsic.extrinsic.method.section,
    extrinsic.extrinsic.method.method,
    extrinsic.block.block.header.number.toBigInt(),
    extrinsic.success,
    extrinsic.extrinsic.isSigned
  );
  return newExtrinsic;
}

function wrapExtrinsics(wrappedBlock: SubstrateBlock): SubstrateExtrinsic[] {
  return wrappedBlock.block.extrinsics.map((extrinsic, idx) => {
    const events = wrappedBlock.events.filter(
      ({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eqn(idx)
    );
    return {
      idx,
      extrinsic,
      block: wrappedBlock,
      events,
      success:
        events.findIndex((evt) => evt.event.method === "ExtrinsicSuccess") > -1,
    };
  });
}
