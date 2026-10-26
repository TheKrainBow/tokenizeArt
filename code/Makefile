# ---------- Config ----------
TOOLS_DIR      := .tools
NODE_VERSION   := v22.13.1
NODE_PLATFORM  := linux-x64
NODE_TARBALL   := node-$(NODE_VERSION)-$(NODE_PLATFORM).tar.xz
NODE_URL       := https://nodejs.org/dist/$(NODE_VERSION)/$(NODE_TARBALL)
NODE_DIR       := $(TOOLS_DIR)/node-$(NODE_VERSION)-$(NODE_PLATFORM)
LOCAL_BIN      := $(NODE_DIR)/bin

# Marker file to know if install was done
INSTALL_MARKER := .installed

# Use the system Node if it is >= 22, otherwise a local copy downloaded in .tools
SYSTEM_NODE_MAJOR := $(shell node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
USE_SYSTEM_NODE   := $(shell [ "$(SYSTEM_NODE_MAJOR)" -ge 22 ] 2>/dev/null && echo yes)

ifeq ($(USE_SYSTEM_NODE),yes)
RUN            :=
else
RUN            := PATH="$(CURDIR)/$(LOCAL_BIN):$$PATH"
endif

NODE           := $(RUN) node
NPM            := $(RUN) npm
HARDHAT        := $(RUN) npx hardhat

# Network used by every blockchain command: sepolia (default) or localhost
NETWORK        ?= sepolia
WEBSITE_PORT   ?= 8042

ENV_FILE       := .env
ENV_VARS       := SEPOLIA_RPC PRIVATE_KEY PRIVATE_KEY2 ARTIST_LOGIN

.PHONY: help ensure-node ensure-env install compile test \
	ipfs-upload deploy mint show owner transfer security verify \
	onchain-deploy onchain-mint onchain-show onchain-transfer onchain-verify \
	website-config website local-node prune clean clean-tools

# ---------- Rules ----------

help:
	@echo "Setup:"
	@echo "  make install          Install Node (if needed) and dependencies"
	@echo "  make compile          Compile contracts"
	@echo "  make test             Run the contract test suite (local, free)"
	@echo ""
	@echo "Mandatory (IPFS collection):"
	@echo "  make ipfs-upload ARTWORK=../mint/artworks/x.png TITLE=\"My title\" [DESCRIPTION=...]"
	@echo "  make deploy           Deploy Mokko42NFT"
	@echo "  make mint             Mint the last uploaded metadata [METADATA_URI=ipfs://... MINT_TO=0x...]"
	@echo "  make show             Show owner + metadata of a token [TOKEN_ID=1]"
	@echo "  make owner            Same as show (ownerOf)"
	@echo "  make transfer         Transfer a token [TOKEN_ID=1 FROM=1|2 TO=0x...]"
	@echo "  make security         Prove that non-owners cannot mint or steal tokens"
	@echo "  make verify           Verify source code on Etherscan"
	@echo ""
	@echo "Bonus (on-chain inscriptions + website):"
	@echo "  make onchain-deploy   Deploy Mokko42Inscriptions"
	@echo "  make onchain-mint ARTWORK=../mint/artworks/x.svg TITLE=\"My title\" [DESCRIPTION=...]"
	@echo "  make onchain-show     Decode the on-chain metadata and image [TOKEN_ID=1]"
	@echo "  make onchain-transfer Transfer an on-chain token [TOKEN_ID=1 FROM=1|2 TO=0x...]"
	@echo "  make onchain-verify   Verify source code on Etherscan"
	@echo "  make website          Generate website config and serve it on http://localhost:$(WEBSITE_PORT)"
	@echo ""
	@echo "Every blockchain command accepts NETWORK=sepolia (default) or NETWORK=localhost."
	@echo "  make local-node       Start a local Hardhat blockchain for NETWORK=localhost"

ensure-node:
	@if [ "$(USE_SYSTEM_NODE)" = "yes" ]; then \
		echo "==> Using system node: $$(node -v)"; \
	elif [ ! -x "$(LOCAL_BIN)/node" ]; then \
		echo "==> Installing local Node $(NODE_VERSION) into $(TOOLS_DIR)"; \
		mkdir -p $(TOOLS_DIR); \
		curl -fsSL "$(NODE_URL)" -o "$(TOOLS_DIR)/$(NODE_TARBALL)"; \
		tar -xJf "$(TOOLS_DIR)/$(NODE_TARBALL)" -C "$(TOOLS_DIR)"; \
		rm -f "$(TOOLS_DIR)/$(NODE_TARBALL)"; \
	fi

install: ensure-node
	@if [ ! -f $(INSTALL_MARKER) ]; then \
		echo "==> Installing dependencies"; \
		$(NPM) install && touch $(INSTALL_MARKER); \
	else \
		echo "==> Dependencies already installed"; \
	fi

# Checks that .env contains the values needed on Sepolia (skipped on localhost)
ensure-env:
	@if [ "$(NETWORK)" != "sepolia" ]; then exit 0; fi; \
	if [ ! -f "$(ENV_FILE)" ]; then \
		echo "==> $(ENV_FILE) not found. Copy .env.example to .env and fill it."; \
		exit 1; \
	fi; \
	MISSING=""; \
	for v in $(ENV_VARS); do \
		VAL="$$(grep -E "^$$v=" "$(ENV_FILE)" | tail -n 1 | sed 's/^[^=]*=//')"; \
		[ -n "$$VAL" ] || MISSING="$$MISSING $$v"; \
	done; \
	if [ -n "$$MISSING" ]; then \
		echo "==> Missing values in $(ENV_FILE):$$MISSING"; \
		exit 1; \
	fi

compile: install
	@echo "==> Compiling contracts"
	$(HARDHAT) compile

test: compile
	@echo "==> Running tests"
	$(HARDHAT) test

# ---------- Mandatory: IPFS collection ----------

ipfs-upload: install
	@echo "==> Uploading artwork and metadata to IPFS"
	$(NODE) scripts/ipfs_upload.cjs

deploy: compile ensure-env
	@echo "==> Deploying Mokko42NFT on $(NETWORK)"
	COLLECTION=nft $(HARDHAT) run scripts/deploy.cjs --network $(NETWORK)

mint: compile ensure-env
	@echo "==> Minting Mokko42NFT on $(NETWORK)"
	$(HARDHAT) run scripts/mint.cjs --network $(NETWORK)

show: compile
	@echo "==> Reading Mokko42NFT token on $(NETWORK)"
	COLLECTION=nft $(HARDHAT) run scripts/show.cjs --network $(NETWORK)

owner: show

transfer: compile ensure-env
	@echo "==> Transferring Mokko42NFT token on $(NETWORK)"
	COLLECTION=nft $(HARDHAT) run scripts/transfer.cjs --network $(NETWORK)

security: compile ensure-env
	@echo "==> Checking privileges on $(NETWORK)"
	$(HARDHAT) run scripts/security.cjs --network $(NETWORK)

verify: compile ensure-env
	@echo "==> Verifying Mokko42NFT on Etherscan"
	COLLECTION=nft $(HARDHAT) run scripts/verify.cjs --network $(NETWORK)

# ---------- Bonus: on-chain inscriptions ----------

onchain-deploy: compile ensure-env
	@echo "==> Deploying Mokko42Inscriptions on $(NETWORK)"
	COLLECTION=inscriptions $(HARDHAT) run scripts/deploy.cjs --network $(NETWORK)

onchain-mint: compile ensure-env
	@echo "==> Inscribing artwork on $(NETWORK)"
	$(HARDHAT) run scripts/onchain_mint.cjs --network $(NETWORK)

onchain-show: compile
	@echo "==> Reading on-chain token on $(NETWORK)"
	COLLECTION=inscriptions $(HARDHAT) run scripts/show.cjs --network $(NETWORK)

onchain-transfer: compile ensure-env
	@echo "==> Transferring on-chain token on $(NETWORK)"
	COLLECTION=inscriptions $(HARDHAT) run scripts/transfer.cjs --network $(NETWORK)

onchain-verify: compile ensure-env
	@echo "==> Verifying Mokko42Inscriptions on Etherscan"
	COLLECTION=inscriptions $(HARDHAT) run scripts/verify.cjs --network $(NETWORK)

# ---------- Bonus: website ----------

website-config: compile
	@echo "==> Generating website/config.js for $(NETWORK)"
	NETWORK=$(NETWORK) $(NODE) scripts/website_config.cjs

website: website-config
	@echo "==> Serving website on http://localhost:$(WEBSITE_PORT)"
	PORT=$(WEBSITE_PORT) $(NODE) scripts/serve_website.cjs

# ---------- Local blockchain ----------

local-node: compile
	@echo "==> Starting local Hardhat node on http://127.0.0.1:8545"
	$(HARDHAT) node

# ---------- Cleaning ----------

prune:
	@echo "==> Cleaning project"
	rm -rf node_modules artifacts cache typechain-types coverage
	rm -f $(INSTALL_MARKER)

clean: prune

clean-tools:
	rm -rf $(TOOLS_DIR)
	rm -f $(INSTALL_MARKER)
