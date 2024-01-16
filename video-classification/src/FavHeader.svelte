<script lang="ts">
  $: isFav = false

  const toggleFav = () => {
    isFav = !isFav

    if (isFav) {
      console.log('create fav')
    } else {
      console.log('remove fav')
    }
  }
</script>

<div class="fav-header">
    <button on:click={toggleFav}>{isFav}</button>
</div>

<style>
  .fav-header {
    display: flex;
    justify-content: flex-end;
  }
</style>
