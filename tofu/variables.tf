variable "media_storage_account_name" {
  description = "Globally-unique name for the chess-tactics media storage account (3-24 lowercase alphanumeric)."
  type        = string
  default     = "chesstacticsmedia"

  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.media_storage_account_name))
    error_message = "Storage account name must be 3-24 lowercase letters/digits."
  }
}
