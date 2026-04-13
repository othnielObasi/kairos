require("dotenv/config");
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const reviewerWallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);

  console.log("Agent (owner):", agentWallet.address);
  console.log("Reviewer:", reviewerWallet.address);

  const agentId = 338;
  const indexLimit = 0n;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const chainId = 84532n;
  const identityRegistry = process.env.IDENTITY_REGISTRY;
  const signerAddress = agentWallet.address;

  // Build the auth message
  const message = ethers.solidityPacked(
    ["uint256", "address", "uint64", "uint256", "uint256", "address", "address"],
    [agentId, reviewerWallet.address, indexLimit, expiry, chainId, identityRegistry, signerAddress]
  );
  console.log("Message hash:", ethers.keccak256(message));

  // Sign it
  const signature = await agentWallet.signMessage(ethers.getBytes(message));
  console.log("Signature:", signature.slice(0, 40) + "...");

  // Pack: signature + indexLimit(8) + expiry(32) + signerAddress(20)
  const feedbackAuth = ethers.solidityPacked(
    ["bytes", "uint64", "uint256", "address"],
    [signature, indexLimit, expiry, signerAddress]
  );
  console.log("feedbackAuth length:", (feedbackAuth.length - 2) / 2, "bytes");
  console.log("feedbackAuth:", feedbackAuth.slice(0, 80) + "...");

  // Now try to estimate gas with this auth
  const repAbi = [
    "function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string fileuri, bytes32 filehash, bytes feedbackAuth) external",
  ];
  const rep = new ethers.Contract(process.env.REPUTATION_REGISTRY, repAbi, reviewerWallet);
  
  const tag1 = ethers.encodeBytes32String("tradingYield");
  const tag2 = ethers.encodeBytes32String("day");

  try {
    const gas = await rep.giveFeedback.estimateGas(
      agentId, 75, tag1, tag2, "", ethers.ZeroHash, feedbackAuth
    );
    console.log("\nSUCCESS! Gas estimate:", gas.toString());
    
    // Actually send it
    console.log("Sending transaction...");
    const tx = await rep.giveFeedback(
      agentId, 75, tag1, tag2, "", ethers.ZeroHash, feedbackAuth
    );
    const receipt = await tx.wait();
    console.log("TX CONFIRMED:", receipt.hash);
  } catch (e) {
    console.log("\nFAILED:", e.shortMessage || e.message.slice(0, 500));
    // Try without the packed fields — maybe auth is just the bare signature
    console.log("\nTrying bare signature...");
    try {
      const gas2 = await rep.giveFeedback.estimateGas(
        agentId, 75, tag1, tag2, "", ethers.ZeroHash, signature
      );
      console.log("Bare sig works! Gas:", gas2.toString());
    } catch (e2) {
      console.log("Bare sig also fails:", e2.shortMessage || e2.message.slice(0, 300));
    }

    // Try with different message encoding — maybe it's abi.encode not solidityPacked
    console.log("\nTrying abi.encode instead of solidityPacked...");
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "uint64", "uint256", "uint256", "address", "address"],
      [agentId, reviewerWallet.address, indexLimit, expiry, chainId, identityRegistry, signerAddress]
    );
    const sig2 = await agentWallet.signMessage(ethers.getBytes(abiEncoded));
    const auth2 = ethers.solidityPacked(
      ["bytes", "uint64", "uint256", "address"],
      [sig2, indexLimit, expiry, signerAddress]
    );
    try {
      const gas3 = await rep.giveFeedback.estimateGas(
        agentId, 75, tag1, tag2, "", ethers.ZeroHash, auth2
      );
      console.log("abi.encode auth works! Gas:", gas3.toString());
    } catch (e3) {
      console.log("abi.encode also fails:", e3.shortMessage || e3.message.slice(0, 300));
    }

    // Try completely empty auth 0x
    console.log("\nTrying empty auth 0x...");
    try {
      const gas4 = await rep.giveFeedback.estimateGas(
        agentId, 75, tag1, tag2, "", ethers.ZeroHash, "0x"
      );
      console.log("Empty auth works! Gas:", gas4.toString());
    } catch (e4) {
      console.log("Empty auth fails:", e4.shortMessage || e4.message.slice(0, 200));
    }
  }
}
main().catch(e => console.error(e));
