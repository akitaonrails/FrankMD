# frozen_string_literal: true

# The picker combines managed note images with the existing server image source.
# Both collections remain local, independent of the provider for new uploads.
class ImageLibraryService
  def list(collection: "managed", search: nil, limit: 10, offset: 0)
    raise ArgumentError, "Unknown image collection" unless %w[managed server].include?(collection)

    limit = limit.to_i.clamp(1, 100)
    offset = [ offset.to_i, 0 ].max
    if collection == "managed"
      all = MediaLibraryService.new.list[:images]
      all = all.select { |image| image[:name].downcase.include?(search.downcase) } if search.present?
      images = (all.slice(offset, limit) || []).map { |image| image.merge(url: image[:path]) }
      total = all.length
    else
      images = ImagesService.list(search: search, limit: limit, offset: offset).map do |image|
        url = "/images/preview/#{image[:path].split('/').map { |part| ERB::Util.url_encode(part) }.join('/')}"
        image.slice(:name, :path).merge(url: url, preview_url: url)
      end
      total = ImagesService.count(search: search)
    end

    {
      images: images, collection: collection, total: total, limit: limit, offset: offset,
      server_available: ImagesService.images_path&.directory? || false
    }
  end
end
