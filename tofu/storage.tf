# ============================================================================
# Game media storage (background music)
# ============================================================================
# Large audio assets (the shuffled BGM library) live in a private Blob container
# rather than the app image. The backend lists metadata for /api/bgm and issues
# short-lived, read-only, per-Blob user-delegation SAS redirects through
# /api/bgm/tracks/:id. Azure serves the browser's audio bytes and Range requests.
# The container is the single source of truth — add/remove a track here and the
# game follows it, with no manifest to regenerate.
#
# Unlike Git-backed media, Blob is now the durable byte authority. Versioning
# and retention therefore protect every game-media container from accidental
# deletion or overwrite during application and infrastructure rollouts.

# Dedicated resource group for chess-tactics' own Azure resources (app-owned
# infra, narrow blast radius), placed alongside the shared infra RG.
resource "azurerm_resource_group" "chess_tactics" {
  name     = "chess-tactics"
  location = data.azurerm_resource_group.infra.location
}

resource "azurerm_storage_account" "media" {
  name                     = var.media_storage_account_name
  resource_group_name      = azurerm_resource_group.chess_tactics.name
  location                 = azurerm_resource_group.chess_tactics.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  # Every game-media container is private. Anonymous visitors receive only the
  # per-Blob capabilities issued by the app-owned playback route.
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 90
    }

    container_delete_retention_policy {
      days = 90
    }
  }

  # No CORS rule: <audio> follows the app redirect with a no-cors media request,
  # and Blob serves GET/HEAD plus Range directly. App JavaScript never reads the
  # cross-origin response body or response headers.

  tags = {
    app       = "chess-tactics"
    managedBy = "chess-tactics"
    purpose   = "game-media"
  }
}

# Background-music container. Both Blob reads and listing require authorization.
# The backend owns discovery and narrowly scoped read-capability issuance.
resource "azurerm_storage_container" "bgm" {
  name                  = "bgm"
  storage_account_id    = azurerm_storage_account.media.id
  container_access_type = "private"
}

# Editable unit sprites. The browser reads these through same-origin backend
# routes so canvas rendering stays untainted; the container itself remains
# private. Blob names are content hashes, so an accepted-art change never
# overwrites bytes already cached by a browser or thumbnail renderer.
resource "azurerm_storage_container" "unit_assets" {
  name                  = "unit-assets"
  storage_account_id    = azurerm_storage_account.media.id
  container_access_type = "private"
}

# Generic runtime, review, candidate, and source-media storage. Blob names are
# content hashes and the container stays private; the backend is the only public
# resolution and delivery boundary for these bytes.
resource "azurerm_storage_container" "live_media" {
  name                  = "live-media"
  storage_account_id    = azurerm_storage_account.media.id
  container_access_type = "private"
}

# chess-tactics' CI service principal (created by module.app_org["chess-tactics"]
# in infra-bootstrap). Data-plane write lets the `sync-bgm-metadata` workflow
# stamp each track's title/artist/album onto its blob as metadata (read from the
# mp3's own ID3 tag). Tracks are added/removed in the container directly (portal /
# Storage Explorer) — CI never uploads audio.
data "azuread_service_principal" "ci" {
  display_name = "chess-tactics"
}

resource "azurerm_role_assignment" "bgm_metadata_writer" {
  scope              = azurerm_storage_container.bgm.resource_manager_id
  role_definition_id = azurerm_role_definition.immutable_media_writer.role_definition_resource_id
  principal_id       = data.azuread_service_principal.ci.object_id
}

# Renamed from bgm_uploader when the old upload pipeline was removed. The role
# is now deliberately narrowed to BGM blob read/write without delete or ACL
# permissions.
moved {
  from = azurerm_role_assignment.bgm_uploader
  to   = azurerm_role_assignment.bgm_metadata_writer
}

# The app pod's workload identity (chess-tactics-identity, identity.tf) builds
# /api/bgm by listing the container and reading each blob's metadata. The app
# never writes BGM. Unit asset write access is separate and container-scoped.
resource "azurerm_role_assignment" "bgm_reader" {
  scope                = azurerm_storage_container.bgm.resource_manager_id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# Azure authorizes Get User Delegation Key only at storage-account scope or
# above. Storage Blob Delegator contains exactly that management-plane action;
# data-plane list/read remains narrowly scoped to the BGM container above, and
# the app gains no BGM write, delete, or ACL permission.
resource "azurerm_role_assignment" "bgm_delegator" {
  scope                = azurerm_storage_account.media.id
  role_definition_name = "Storage Blob Delegator"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# Game services create and read immutable content-addressed blobs, but never
# delete them or mutate container ACLs. Lifecycle changes happen in Postgres;
# stale objects remain protected by hash identity plus storage retention.
resource "azurerm_role_definition" "immutable_media_writer" {
  name        = "Chess Tactics Immutable Media Writer"
  scope       = azurerm_resource_group.chess_tactics.id
  description = "Read/create game-media blobs without delete or container-management permissions."

  permissions {
    actions = []
    data_actions = [
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write",
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action",
    ]
  }

  assignable_scopes = [azurerm_resource_group.chess_tactics.id]
}

# Unit Studio writes candidates and accepted sprite sets through the backend.
# Scope contributor access to this container; the BGM container remains read-only
# to the app identity.
resource "azurerm_role_assignment" "unit_assets_writer" {
  scope              = azurerm_storage_container.unit_assets.resource_manager_id
  role_definition_id = azurerm_role_definition.immutable_media_writer.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.app.principal_id
}

# Runtime asset review and promotion write immutable content-addressed objects;
# scope that access to the private live-media container instead of the account.
resource "azurerm_role_assignment" "live_media_writer" {
  scope              = azurerm_storage_container.live_media.resource_manager_id
  role_definition_id = azurerm_role_definition.immutable_media_writer.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.app.principal_id
}

output "media_storage_account" {
  value       = azurerm_storage_account.media.name
  description = "Storage account holding chess-tactics game media."
}

output "bgm_container" {
  value       = azurerm_storage_container.bgm.name
  description = "Blob container holding the shuffled BGM tracks."
}

# Private backend storage locator set as BGM_CONTAINER_URL in Kubernetes. It is
# not a browser/public base and never appears in the playlist response.
output "bgm_container_url" {
  value       = "https://${azurerm_storage_account.media.name}.blob.core.windows.net/${azurerm_storage_container.bgm.name}"
  description = "Private BGM container locator used by the backend for listing and capability issuance."
}

output "unit_assets_container_url" {
  value       = "https://${azurerm_storage_account.media.name}.blob.core.windows.net/${azurerm_storage_container.unit_assets.name}"
  description = "Private container used by the live unit-art catalog."
}

output "live_media_container_url" {
  value       = "https://${azurerm_storage_account.media.name}.blob.core.windows.net/${azurerm_storage_container.live_media.name}"
  description = "Private content-addressed container used by the generic live-media catalog."
}
