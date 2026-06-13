<script setup>
import CatalogManager from '../components/CatalogManager.vue'
import { supplierApi } from '../api/invoices'
</script>

<template>
  <CatalogManager
    kind="supplier"
    :api="supplierApi"
    title="អ្នកផ្គត់ផ្គង់"
  />
</template>
